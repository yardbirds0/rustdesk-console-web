import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type Capabilities,
  type CreateJobRequest,
  type JobView,
  type SavedUpdate,
  type UpdatePlan,
  createIdempotencyKey,
  createUpdatePlan,
  getCurrentUpdateJob,
  getUpdateCapabilities,
  getUpdateJob,
  getWebHealth,
  isTerminalJob,
  pollingDelay,
  readSavedUpdate,
  saveUpdate,
  submitUpdateJob,
  SystemUpdateError,
} from '@/services/rustdesk-console/systemUpdate';

export type ViewState =
  | 'checking'
  | 'blocked'
  | 'preview'
  | 'submitting'
  | 'tracking'
  | 'reconnecting'
  | 'terminal'
  | 'error'
  | 'auth';
export type SystemUpdateView = ReturnType<typeof useSystemUpdate>;

export function useSystemUpdate(open: boolean) {
  const [state, setState] = useState<ViewState>('checking');
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [plan, setPlan] = useState<UpdatePlan | null>(null);
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<SystemUpdateError | null>(null);
  const [pending, setPending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const session = useRef<SavedUpdate | null>(null);
  const generation = useRef(0);
  const submitting = useRef(false);
  const mounted = useRef(false);

  const remember = useCallback((value: SavedUpdate | null) => {
    session.current = value;
    saveUpdate(value);
    setPending(Boolean(value?.submission));
  }, []);

  const acceptJob = useCallback(
    (next: JobView, installationId: string | null) => {
      if (next.installationId !== installationId)
        throw new SystemUpdateError('INSTALLATION_CHANGED');
      generation.current++;
      remember({ installationId: next.installationId, jobId: next.jobId });
      setJob(next);
      setPlan(null);
      setError(null);
      setState(isTerminalJob(next) ? 'terminal' : 'tracking');
    },
    [remember],
  );

  const fail = useCallback((reason: unknown) => {
    const failure =
      reason instanceof SystemUpdateError
        ? reason
        : new SystemUpdateError('INVALID_RESPONSE');
    setError(failure);
    setState(
      failure.auth ? 'auth' : failure.transient ? 'reconnecting' : 'error',
    );
  }, []);

  // Query current first on every open/reconnect; a stored ID never selects an installation.
  useEffect(() => {
    if (!open) return;
    mounted.current = true;
    const currentGeneration = ++generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const valid = () =>
      mounted.current && generation.current === currentGeneration;
    session.current = readSavedUpdate();
    setPending(Boolean(session.current?.submission));
    setState('checking');
    setPlan(null);
    setJob(null);
    setError(null);
    setVerified(false);
    const load = async () => {
      if (!valid()) return;
      try {
        const capability = await getUpdateCapabilities();
        if (!valid()) return;
        setCapabilities(capability);
        if (
          session.current &&
          session.current.installationId !== capability.installationId
        )
          remember(null);
        if (!capability.installationId) {
          setState('blocked');
          return;
        }
        const current = await getCurrentUpdateJob();
        if (!valid()) return;
        if (current.installationId !== capability.installationId)
          throw new SystemUpdateError('INSTALLATION_CHANGED');
        const waiting = session.current?.submission;
        if (
          waiting &&
          (!current.job ||
            (isTerminalJob(current.job) &&
              current.job.planId !== waiting.planId))
        ) {
          // The previous terminal job cannot resolve an in-flight, unacknowledged submission.
          setPending(true);
          setState('reconnecting');
          timer = setTimeout(load, pollingDelay(failures++));
          return;
        }
        if (current.job) {
          acceptJob(current.job, current.installationId);
          return;
        }
        if (session.current?.jobId) {
          const saved = await getUpdateJob(session.current.jobId);
          if (valid()) acceptJob(saved, current.installationId);
          return;
        }
        if (!capability.supported || !capability.ready) {
          setState('blocked');
          return;
        }
        const next = await createUpdatePlan();
        if (!valid()) return;
        if (next.installationId !== capability.installationId)
          throw new SystemUpdateError('INSTALLATION_CHANGED');
        setPlan(next);
        setState('preview');
      } catch (reason) {
        if (!valid()) return;
        fail(reason);
        if (reason instanceof SystemUpdateError && reason.transient) {
          timer = setTimeout(load, pollingDelay(failures++));
        }
      }
    };
    void load();
    return () => {
      mounted.current = false;
      generation.current++;
      clearTimeout(timer);
    };
  }, [open, attempt, acceptJob, fail, remember]);

  useEffect(() => {
    if (
      !open ||
      !job ||
      isTerminalJob(job) ||
      state === 'auth' ||
      state === 'error'
    )
      return;
    let stopped = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await getUpdateJob(job.jobId);
        if (stopped) return;
        if (next.jobId !== job.jobId)
          throw new SystemUpdateError('INVALID_RESPONSE');
        acceptJob(next, job.installationId);
        failures = 0;
        if (isTerminalJob(next)) return;
      } catch (reason) {
        if (stopped) return;
        fail(reason);
        if (!(reason instanceof SystemUpdateError) || !reason.transient) return;
        failures++;
      }
      timer = setTimeout(poll, pollingDelay(failures));
    };
    timer = setTimeout(poll, pollingDelay(0));
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [
    open,
    job?.jobId,
    job?.installationId,
    job?.status,
    state === 'auth',
    state === 'error',
    acceptJob,
    fail,
  ]);

  // A succeeded worker result and a verified live web build are separate facts.
  useEffect(() => {
    if (!open || job?.status !== 'succeeded') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const verify = async () => {
      try {
        const health = await getWebHealth();
        if (stopped) return;
        const web = job.components.find(
          (component) => component.component === 'web',
        );
        if (!health.ready || health.version !== web?.target)
          throw new SystemUpdateError('WEB_VERSION_MISMATCH');
        setVerified(true);
        setError(null);
      } catch (reason) {
        if (stopped) return;
        setError(
          reason instanceof SystemUpdateError
            ? reason
            : new SystemUpdateError('INVALID_RESPONSE'),
        );
        if (failures < 9) timer = setTimeout(verify, pollingDelay(failures++));
      }
    };
    void verify();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [open, job?.jobId, job?.status]);

  // A finished job remains visible, but must not hide future updates on every open.
  useEffect(() => {
    if (
      !open ||
      !job ||
      !isTerminalJob(job) ||
      job.status === 'recovery_required'
    )
      return;
    let stopped = false;
    const refresh = async () => {
      try {
        const capability = await getUpdateCapabilities();
        if (stopped) return;
        if (capability.installationId !== job.installationId)
          throw new SystemUpdateError('INSTALLATION_CHANGED');
        setCapabilities(capability);
        if (!capability.supported || !capability.ready) return;
        const next = await createUpdatePlan();
        if (stopped) return;
        if (next.installationId !== job.installationId)
          throw new SystemUpdateError('INSTALLATION_CHANGED');
        setPlan(next);
      } catch (reason) {
        if (!stopped) {
          if (reason instanceof SystemUpdateError && reason.auth) fail(reason);
          else
            setError(
              reason instanceof SystemUpdateError
                ? reason
                : new SystemUpdateError('INVALID_RESPONSE'),
            );
        }
      }
    };
    void refresh();
    return () => {
      stopped = true;
    };
  }, [open, job?.jobId, job?.status]);

  const submit = async (acknowledged: boolean) => {
    if (!acknowledged || submitting.current || !capabilities?.installationId)
      return;
    const retry = session.current?.submission;
    if (!retry && (!plan?.executable || !plan.changes || plan.blockers.length))
      return;
    submitting.current = true;
    const currentGeneration = generation.current;
    const valid = () =>
      mounted.current && currentGeneration === generation.current;
    const refreshPlan = async () => {
      const next = await createUpdatePlan();
      if (!valid()) return null;
      if (next.installationId !== capabilities.installationId)
        throw new SystemUpdateError('INSTALLATION_CHANGED');
      if (Date.parse(next.expiresAt) <= Date.now())
        throw new SystemUpdateError('PLAN_EXPIRED');
      setPlan(next);
      setError(null);
      // A refreshed plan may have a different target: show it before accepting it.
      const sameTargets =
        plan &&
        next.components.every((component) => {
          const previous = plan.components.find(
            (item) => item.component === component.component,
          );
          return (
            previous?.current === component.current &&
            previous?.target === component.target &&
            previous?.action === component.action
          );
        });
      if (
        !next.executable ||
        !next.changes ||
        next.blockers.length ||
        !sameTargets
      ) {
        setJob(null);
        setState('preview');
        if (next.executable && next.changes && !sameTargets)
          setError(new SystemUpdateError('PLAN_CHANGED'));
        return null;
      }
      return next;
    };
    try {
      setState('submitting');
      let selected = plan;
      if (!retry && selected && Date.parse(selected.expiresAt) <= Date.now())
        selected = await refreshPlan();
      const selectedId = retry?.planId || selected?.planId;
      if (!selectedId) return;
      let data: CreateJobRequest = retry || {
        planId: selectedId,
        idempotencyKey: createIdempotencyKey(),
        acknowledgeDowntime: true,
      };
      // Persist before sending so a lost response/refresh retries the identical request.
      remember({
        installationId: capabilities.installationId,
        submission: data,
      });
      setJob(null);
      let response: Awaited<ReturnType<typeof submitUpdateJob>>;
      try {
        response = await submitUpdateJob(data);
      } catch (reason) {
        if (
          !(reason instanceof SystemUpdateError) ||
          reason.status !== 409 ||
          reason.code !== 'PLAN_EXPIRED'
        )
          throw reason;
        // An explicit rejection cannot have accepted a job. Refresh and retry once.
        remember(null);
        selected = await refreshPlan();
        if (!selected) return;
        data = {
          planId: selected.planId,
          idempotencyKey: createIdempotencyKey(),
          acknowledgeDowntime: true,
        };
        remember({
          installationId: capabilities.installationId,
          submission: data,
        });
        response = await submitUpdateJob(data);
      }
      if (valid()) acceptJob(response.job, capabilities.installationId);
      else
        saveUpdate({
          installationId: response.job.installationId,
          jobId: response.jobId,
        });
    } catch (reason) {
      if (!mounted.current || currentGeneration !== generation.current) return;
      fail(reason);
      if (
        reason instanceof SystemUpdateError &&
        !reason.transient &&
        !reason.auth &&
        reason.status
      ) {
        remember(null);
        setPlan(null);
      } else if (reason instanceof SystemUpdateError && reason.transient) {
        // Reconcile a possibly accepted request before offering its idempotent retry.
        setAttempt((value) => value + 1);
      }
    } finally {
      submitting.current = false;
    }
  };

  return {
    state,
    capabilities,
    plan,
    job,
    error,
    pending,
    verified,
    submit,
    reconnect: () => setAttempt((value) => value + 1),
  };
}
