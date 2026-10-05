import { Alert, Button, Input, Space } from 'antd';
import {
  FolderOutlined,
  FileOutlined,
  DownloadOutlined,
  UploadOutlined,
  FolderOpenOutlined,
  ArrowUpOutlined,
  ReloadOutlined,
  ArrowRightOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import styles from './index.less';
import { LegacyEncryptionNotice } from './legacy-notice';
import { safePath } from '@/features/web-client/files/transfer';
import {
  LocalDirectory,
  directoryDownload,
  LocalFileConflict,
  localDirectorySupported,
  type LocalDirectoryView,
  type LocalDirectoryHandle,
} from '@/features/web-client/files/local-directory';
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { KxVersion } from '@/features/web-client/core/crypto';
import type { SessionState } from '@/features/web-client/core/session';
import {
  chooseDownload,
  type DownloadSink,
} from '@/features/web-client/files/download';
import type {
  FileCommand,
  FileProgress,
  RemoteEntry,
} from '@/features/web-client/files/transfer';
import type {
  SessionCommand,
  WorkerEvent,
} from '@/features/web-client/worker/contract';

type FileWorkerEvent = Extract<WorkerEvent, { fileGeneration: number }>;
export interface FilePanelStatus {
  state: SessionState;
  legacy: boolean;
  error: string;
  busy: boolean;
}
export interface FilePanelHandle {
  handle(event: FileWorkerEvent): void;
  dispose(): void;
}
export const FilePanel = forwardRef<
  FilePanelHandle,
  {
    enabled: boolean;
    open?: boolean;
    onStatusChange?: (status: FilePanelStatus) => void;
    post: (command: SessionCommand) => void;
    text: (key: string, fallback: string) => string;
  }
>(function FilePanel(
  { enabled, open = false, post, text, onStatusChange },
  ref,
) {
  const [state, setState] = useState<SessionState>('idle');
  const [password, setPassword] = useState('');
  const [passwordEntry, setPasswordEntry] = useState(false);
  const [security, setSecurity] = useState<KxVersion>();
  const [error, setError] = useState('');
  const [path, setPath] = useState('');
  const [draftPath, setDraftPath] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string>();
  const [entries, setEntries] = useState<RemoteEntry[]>([]);
  const [progress, setProgress] = useState<FileProgress>();
  const [choosing, setChoosing] = useState(false);
  const local = useRef(new LocalDirectory());
  const [localView, setLocalView] = useState<LocalDirectoryView>();
  const [localDraft, setLocalDraft] = useState('/');
  const [localSelected, setLocalSelected] = useState<string>();
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState(false);
  const localEpoch = useRef(0);
  const [localConflict, setLocalConflict] = useState<{
    entry: RemoteEntry;
    target: LocalDirectoryHandle;
    epoch: number;
    fileGeneration: number;
  }>();
  const downloadTarget = useRef<LocalDirectoryHandle | undefined>(undefined);
  const activeJob = useRef<number | undefined>(undefined);
  const generation = useRef(0);
  const operation = useRef(0);
  const sink = useRef<DownloadSink | undefined>(undefined);
  const connected = state === 'connected';
  const busy =
    choosing ||
    !!localConflict ||
    (!!progress &&
      !['done', 'skipped', 'cancelled', 'error'].includes(progress.phase));
  useEffect(() => {
    onStatusChange?.({
      state,
      legacy: security === 0 && !['idle', 'closed', 'failed'].includes(state),
      error,
      busy,
    });
  }, [state, security, error, busy, onStatusChange]);
  const command = (value: FileCommand) =>
    post({
      type: 'files-command',
      command: value,
      fileGeneration: generation.current,
    });
  const abortSink = () => {
    activeJob.current = undefined;
    downloadTarget.current = undefined;
    setLocalConflict(undefined);
    ++operation.current;
    const current = sink.current;
    sink.current = undefined;
    if (current) void current.abort().catch(() => {});
    setChoosing(false);
  };
  const resetRemote = () => {
    abortSink();
    setState('closed');
    setPassword('');
    setPasswordEntry(false);
    setSecurity(undefined);
    setEntries([]);
    setProgress(undefined);
    setPath('');
    setDraftPath('');
    setSelectedPath(undefined);
    setBrowsing(false);
  };
  const dispose = () => {
    // 撤权/父会话清理后，已排队的旧文件事件不得恢复状态。
    if (generation.current) ++generation.current;
    resetRemote();
    local.current.dispose();
    ++localEpoch.current;
    setLocalView(undefined);
    setLocalDraft('/');
    setLocalSelected(undefined);
    setLocalError(false);
    setLocalLoading(false);
  };
  const refreshLocal = () => {
    const view = local.current.current();
    if (view) void navigateLocal(view.path);
  };
  useImperativeHandle(ref, () => ({
    dispose,
    handle(event) {
      if (event.fileGeneration !== generation.current) return;
      if (event.type === 'files-state') {
        setState(event.state);
        if (event.state === 'closed' || event.state === 'failed') {
          resetRemote();
          setState(event.state);
        }
        if (event.state === 'connected') {
          setPassword('');
          setPasswordEntry(false);
        }
      } else if (event.type === 'files-security') setSecurity(event.kxVersion);
      else if (event.type === 'files-error') {
        setBrowsing(false);
        setError(event.code);
        if (event.code === 'password') setPasswordEntry(true);
        abortSink();
      } else if (event.type === 'files-event') {
        const data = event.event;
        if (data.type === 'directory') {
          setPath(data.path);
          setDraftPath(data.path);
          setSelectedPath(undefined);
          setBrowsing(false);
          setError('');
          setEntries(data.entries);
        } else if (data.type === 'error') {
          setBrowsing(false);
          setError('files');
          abortSink();
        } else if (data.type === 'progress') {
          if (data.progress.phase === 'waiting')
            activeJob.current = data.progress.id;
          setProgress(data.progress);
          if (data.progress.phase === 'done') {
            if (
              data.progress.direction === 'download' &&
              downloadTarget.current === local.current.current()?.handle
            )
              refreshLocal();
          }
          if (['cancelled', 'error', 'skipped'].includes(data.progress.phase))
            abortSink();
        } else {
          if (data.id !== activeJob.current) return;
          const current = sink.current;
          const epoch = operation.current;
          const fileGeneration = generation.current;
          void (async () => {
            let ok = false;
            try {
              if (!current) throw new Error();
              if (data.type === 'chunk') await current.write(data.bytes);
              else await current.close();
              ok = true;
            } catch {
              // 失败也先核对任务归属，旧写流不能取消后续下载。
            }
            if (
              fileGeneration === generation.current &&
              epoch === operation.current &&
              data.id === activeJob.current
            ) {
              post({
                type: 'files-command',
                fileGeneration,
                command: {
                  type: 'consumed',
                  id: data.id,
                  sequence: data.sequence,
                  ok,
                },
              });
              if (!ok) {
                setError('files');
                abortSink();
              } else if (data.type === 'download-done') {
                sink.current = undefined;
                activeJob.current = undefined;
                if (downloadTarget.current === local.current.current()?.handle)
                  refreshLocal();
                downloadTarget.current = undefined;
              }
            }
          })();
        }
      }
    },
  }));
  useEffect(() => {
    if (!enabled) {
      if (generation.current)
        post({ type: 'files-disconnect', fileGeneration: generation.current });
      dispose();
    }
    return () => {
      const current = sink.current;
      sink.current = undefined;
      ++operation.current;
      if (current) void current.abort().catch(() => {});
      local.current.dispose();
      ++localEpoch.current;
    };
  }, [enabled]);
  const startConnection = () => {
    if (!enabled || !['idle', 'closed', 'failed'].includes(state)) return;
    resetRemote();
    setError('');
    ++generation.current;
    setState('connecting');
    post({ type: 'files-connect', fileGeneration: generation.current });
  };
  useEffect(() => {
    if (open && enabled && ['idle', 'closed', 'failed'].includes(state))
      startConnection();
  }, [open, enabled]);
  const chooseLocal = async () => {
    if (localLoading || busy) return;
    const epoch = ++localEpoch.current;
    setLocalLoading(true);
    setLocalError(false);
    try {
      const view = await local.current.choose();
      if (epoch === localEpoch.current && view) {
        setLocalView(view);
        setLocalDraft(view.path);
        setLocalSelected(undefined);
      }
    } catch {
      if (epoch === localEpoch.current) setLocalError(true);
    } finally {
      if (epoch === localEpoch.current) setLocalLoading(false);
    }
  };
  const navigateLocal = async (next: string) => {
    const epoch = ++localEpoch.current;
    setLocalLoading(true);
    setLocalError(false);
    try {
      const view = await local.current.navigate(next);
      if (epoch === localEpoch.current && view) {
        setLocalView(view);
        setLocalDraft(view.path);
        setLocalSelected(undefined);
      }
    } catch {
      if (epoch === localEpoch.current) setLocalError(true);
    } finally {
      if (epoch === localEpoch.current) setLocalLoading(false);
    }
  };
  const prepareDownload = async (
    entry: RemoteEntry,
    target?: LocalDirectoryHandle,
    overwrite = false,
    existingEpoch?: number,
  ) => {
    const epoch = existingEpoch ?? ++operation.current;
    const currentGeneration = generation.current;
    setLocalConflict(undefined);
    setChoosing(true);
    try {
      const next = target
        ? await directoryDownload(target, entry.name, entry.size, overwrite)
        : await chooseDownload(entry.name, entry.size);
      if (
        epoch !== operation.current ||
        currentGeneration !== generation.current
      ) {
        await next.abort();
        return;
      }
      sink.current = next;
      downloadTarget.current = target;
      setChoosing(false);
      command({
        type: 'download',
        path: entry.path,
        name: entry.name,
        size: entry.size,
      });
    } catch (cause) {
      if (
        epoch !== operation.current ||
        currentGeneration !== generation.current
      )
        return;
      setChoosing(false);
      if (target && cause instanceof LocalFileConflict)
        setLocalConflict({
          entry,
          target,
          epoch,
          fileGeneration: currentGeneration,
        });
      else if (!(cause instanceof Error && cause.name === 'AbortError'))
        setError(target ? 'localFiles' : 'files');
    }
  };
  const download = (entry: RemoteEntry) => {
    if (connected && !busy)
      void prepareDownload(entry, local.current.current()?.handle);
  };
  const uploadLocal = async () => {
    const entry = localView?.entries.find(
      (item) => item.name === localSelected,
    );
    if (
      !connected ||
      busy ||
      !entry ||
      entry.handle.kind !== 'file' ||
      !path ||
      path === '/'
    )
      return;
    const epoch = ++operation.current,
      fileGeneration = generation.current,
      destination = path;
    setChoosing(true);
    try {
      const file = await entry.handle.getFile();
      if (epoch !== operation.current || fileGeneration !== generation.current)
        return;
      command({ type: 'upload', path: destination, files: [file] });
    } catch {
      if (epoch === operation.current) setError('localFiles');
    } finally {
      if (epoch === operation.current) setChoosing(false);
    }
  };
  const selected = entries.find((entry) => entry.path === selectedPath);
  const canNavigate = connected && !busy && !browsing;
  const browse = (next: string) => {
    if (!canNavigate) return;
    try {
      const normalized = safePath(next);
      setError('');
      setBrowsing(true);
      command({ type: 'list', path: normalized });
    } catch {
      setError('filePath');
    }
  };
  const parent =
    path === '/' || !path || /^[A-Z]:\/$/.test(path)
      ? '/'
      : path.slice(0, path.lastIndexOf('/')) || '/';
  const renderEntries = (localPane: boolean) => {
    const rows = localPane
      ? (localView?.entries || []).map((item) => ({
          name: item.name,
          directory: item.directory,
          path: item.name,
          size: undefined as number | undefined,
        }))
      : entries;
    const selected = localPane ? localSelected : selectedPath;
    const allowed = localPane
      ? !!localView && !localLoading && !busy
      : canNavigate;
    return (
      <>
        <div
          className={styles.fileColumns}
          aria-hidden="true"
          data-file-header={localPane ? 'local' : 'remote'}
        >
          <span>{text('fileName', 'Name')}</span>
          <span>{text('fileSize', 'Size')}</span>
        </div>
        <div
          className={styles.fileList}
          aria-busy={localPane ? localLoading : browsing}
          data-file-list={localPane ? 'local' : 'remote'}
        >
          {!rows.length && (
            <div className={styles.emptyFiles}>
              <FolderOpenOutlined />
              <span>
                {text(
                  localPane && !localView ? 'localDirectoryHint' : 'fileEmpty',
                  localPane && !localView
                    ? 'Choose a local folder to browse and receive files.'
                    : 'This directory is empty',
                )}
              </span>
            </div>
          )}
          <ul
            aria-label={text(
              localPane ? 'localEntries' : 'fileEntries',
              localPane ? 'Local folder contents' : 'Remote directory contents',
            )}
          >
            {rows.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className={styles.fileRow}
                  aria-label={entry.name}
                  aria-pressed={entry.path === selected}
                  disabled={!allowed}
                  title={entry.name}
                  onClick={() =>
                    localPane
                      ? setLocalSelected(entry.path)
                      : setSelectedPath(entry.path)
                  }
                  onDoubleClick={() => {
                    if (entry.directory)
                      localPane
                        ? void navigateLocal(
                            `${localView?.path === '/' ? '' : localView?.path}/${
                              entry.name
                            }`,
                          )
                        : browse(entry.path);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && entry.directory) {
                      event.preventDefault();
                      localPane
                        ? void navigateLocal(
                            `${localView?.path === '/' ? '' : localView?.path}/${
                              entry.name
                            }`,
                          )
                        : browse(entry.path);
                    }
                  }}
                >
                  <span className={styles.fileName}>
                    {entry.directory ? <FolderOutlined /> : <FileOutlined />}
                    <span>{entry.name}</span>
                  </span>
                  <span className={styles.fileSize}>
                    {entry.directory || entry.size === undefined
                      ? '—'
                      : entry.size < 1024
                        ? entry.size + ' B'
                        : entry.size < 1048576
                          ? (entry.size / 1024).toFixed(1) + ' KiB'
                          : (entry.size / 1048576).toFixed(1) + ' MiB'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </>
    );
  };
  const localFile = localView?.entries.find(
    (entry) => entry.name === localSelected && !entry.directory,
  );
  const disconnectFiles = () => {
    post({ type: 'files-disconnect', fileGeneration: generation.current });
    ++generation.current;
    resetRemote();
  };
  return (
    <div className={styles.filePicker}>
      <div className={styles.fileSessionBar}>
        <span className={styles.fileState} role="status">
          {text(`state.${state}`, state)}
        </span>
        {['idle', 'closed', 'failed'].includes(state) && (
          <Button disabled={!enabled} onClick={startConnection}>
            {text('fileConnect', 'Connect files')}
          </Button>
        )}
        {!['idle', 'closed', 'failed'].includes(state) && (
          <Button size="small" onClick={disconnectFiles}>
            {text('fileDisconnect', 'Disconnect files')}
          </Button>
        )}
        {security === 0 && !['idle', 'closed', 'failed'].includes(state) && (
          <LegacyEncryptionNotice text={text} context="files" />
        )}
      </div>
      {error && (
        <Alert
          type="error"
          message={text(
            `error.${error}`,
            'File operation failed or was denied. Retry the file session.',
          )}
        />
      )}
      {['authenticating', 'awaitingApproval'].includes(state) && (
        <div className={styles.fileAuthentication}>
          <span>
            {text(
              'fileApprovalHint',
              'Waiting for the remote device. You can enter its password if needed.',
            )}
          </span>
          {!passwordEntry && (
            <Button size="small" onClick={() => setPasswordEntry(true)}>
              {text('fileUsePassword', 'Use password')}
            </Button>
          )}
          {passwordEntry && (
            <div className={styles.fileAuth}>
              <Input.Password
                autoComplete="off"
                aria-label={text('filePassword', 'File session password')}
                value={password}
                maxLength={4096}
                onChange={(event) => setPassword(event.target.value)}
                onPressEnter={() => {
                  if (password) {
                    post({
                      type: 'files-password',
                      password,
                      fileGeneration: generation.current,
                    });
                    setPassword('');
                  }
                }}
              />
              <div className={styles.fileAuthActions}>
                <Button onClick={disconnectFiles}>
                  {text('cancelConnection', 'Cancel connection')}
                </Button>
                <Button
                  type="primary"
                  disabled={!password}
                  onClick={() => {
                    post({
                      type: 'files-password',
                      password,
                      fileGeneration: generation.current,
                    });
                    setPassword('');
                  }}
                >
                  {text('authenticate', 'Connect')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className={styles.filePanes}>
        <section
          className={styles.filePane}
          data-file-pane="local"
          aria-label={text('localFiles', 'Local files')}
        >
          <div className={styles.filePaneHeading}>
            <strong>{text('localFiles', 'Local files')}</strong>
            <span title={localView?.rootName}>
              {localView?.rootName ||
                text('localFolderNotChosen', 'No folder selected')}
            </span>
            <Button
              size="small"
              disabled={!localDirectorySupported() || busy || localLoading}
              onClick={() => void chooseLocal()}
            >
              {text(
                localView ? 'localChangeFolder' : 'localChooseFolder',
                localView ? 'Change folder' : 'Choose folder',
              )}
            </Button>
          </div>
          <div className={styles.fileNavigation}>
            <Button
              icon={<ArrowUpOutlined />}
              aria-label={text('localUp', 'Parent local folder')}
              disabled={
                !localView || localView.path === '/' || localLoading || busy
              }
              onClick={() => {
                if (localView)
                  void navigateLocal(
                    localView.path.slice(0, localView.path.lastIndexOf('/')) ||
                      '/',
                  );
              }}
            />
            <Button
              icon={<ReloadOutlined />}
              aria-label={text('localRefresh', 'Refresh local folder')}
              disabled={!localView || localLoading || busy}
              onClick={refreshLocal}
            />
            <Input
              aria-label={text(
                'localPath',
                'Path within the selected local folder',
              )}
              value={localDraft}
              disabled={!localView || localLoading || busy}
              maxLength={2048}
              onChange={(event) => setLocalDraft(event.target.value)}
              onPressEnter={() => void navigateLocal(localDraft)}
            />
            <Button
              disabled={!localView || localLoading || busy}
              onClick={() => void navigateLocal(localDraft)}
            >
              {text('fileBrowse', 'Open directory')}
            </Button>
          </div>
          {renderEntries(true)}
          {localError && (
            <small className={styles.localFileError}>
              {text(
                'error.localFiles',
                'Local folder access failed. Choose a folder again, or use upload and download.',
              )}
            </small>
          )}
          {!localDirectorySupported() && (
            <small className={styles.fileLimit}>
              {text(
                'localDirectoryUnavailable',
                'Folder access is unavailable. Use file upload and browser download.',
              )}
            </small>
          )}
          <div className={styles.filePaneFooter}>
            <span title={localSelected}>
              {localSelected ||
                text(
                  'localRelativeHint',
                  'Paths stay within the selected folder.',
                )}
            </span>
          </div>
        </section>
        <div className={styles.fileDirections}>
          <Button
            icon={<ArrowRightOutlined />}
            aria-label={text('fileSendToRemote', 'Send to remote folder')}
            title={text('fileSendToRemote', 'Send to remote folder')}
            disabled={!canNavigate || !localFile || !path || path === '/'}
            onClick={() => void uploadLocal()}
          />
          <Button
            icon={<ArrowLeftOutlined />}
            aria-label={text('fileReceiveHere', 'Receive in local folder')}
            title={text('fileReceiveHere', 'Receive in local folder')}
            disabled={!canNavigate || !selected || selected.directory}
            onClick={() => {
              if (selected && !selected.directory) download(selected);
            }}
          />
        </div>
        <section
          className={styles.filePane}
          data-file-pane="remote"
          aria-label={text('remoteFiles', 'Remote files')}
        >
          <div className={styles.filePaneHeading}>
            <strong>{text('remoteFiles', 'Remote files')}</strong>
            <span>{text(`state.${state}`, state)}</span>
          </div>
          <div className={styles.fileNavigation}>
            <Button
              icon={<ArrowUpOutlined />}
              aria-label={text('fileUp', 'Parent directory')}
              disabled={!canNavigate}
              onClick={() => browse(parent)}
            />
            <Button
              icon={<ReloadOutlined />}
              aria-label={text('fileRefresh', 'Refresh directory')}
              disabled={!canNavigate}
              onClick={() => browse(path)}
            />
            <Input
              aria-label={text('filePath', 'Remote directory')}
              value={draftPath}
              disabled={!canNavigate}
              maxLength={2048}
              onChange={(event) => setDraftPath(event.target.value)}
              onPressEnter={() => browse(draftPath)}
            />
            <Button disabled={!canNavigate} onClick={() => browse(draftPath)}>
              {text('fileBrowse', 'Open directory')}
            </Button>
          </div>
          {renderEntries(false)}
          <div className={styles.filePaneFooter}>
            <span title={selected?.name}>
              {selected?.name ||
                text('fileSelectHint', 'Select a file to download')}
            </span>
          </div>
        </section>
      </div>
      <details
        className={styles.fileFallback}
        data-file-fallback
        open={!localView || localError || error === 'localFiles'}
      >
        <summary>{text('fileFallback', 'File upload and download')}</summary>
        <div className={styles.fileFallbackActions}>
          <div className={styles.fileFallbackOption}>
            <label className={styles.uploadField}>
              <UploadOutlined />{' '}
              {text('fileUploadHere', 'Upload to this folder')}
              <input
                aria-label={text('fileUploadHere', 'Upload to this folder')}
                type="file"
                multiple
                disabled={!canNavigate || !path || path === '/'}
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  event.target.value = '';
                  if (files.length && canNavigate && path && path !== '/')
                    command({ type: 'upload', path, files });
                }}
              />
            </label>
            <small title={path}>
              {text('fileUploadTarget', 'Remote folder')}: {path || '—'}
            </small>
          </div>
          <div className={styles.fileFallbackOption}>
            <Button
              icon={<DownloadOutlined />}
              disabled={!canNavigate || !selected || selected.directory}
              onClick={() => {
                if (selected && !selected.directory)
                  void prepareDownload(selected);
              }}
            >
              {text('fileDownloadSelected', 'Download selected file')}
            </Button>
            <small title={selected?.name}>
              {selected?.name ||
                text('fileSelectHint', 'Select a file to download')}
            </small>
          </div>
        </div>
      </details>
      <div className={styles.fileStatusBar} role="status">
        {progress ? (
          <>
            <span className={styles.fileProgressName} title={progress.name}>
              {progress.name} ·{' '}
              {text(`filePhase.${progress.phase}`, progress.phase)}
            </span>
            <progress
              max={Math.max(1, progress.total)}
              value={progress.transferred}
            />
            <small>
              {progress.transferred} / {progress.total} B
            </small>
          </>
        ) : (
          <span>
            {text(
              'fileDirectHint',
              'Select a file and use the arrows to transfer it.',
            )}
          </span>
        )}
        {(busy || choosing) && (
          <Button
            size="small"
            onClick={() => {
              abortSink();
              command({ type: 'cancel' });
            }}
          >
            {text('fileCancel', 'Cancel transfer')}
          </Button>
        )}
      </div>
      {progress?.phase === 'conflict' && (
        <Space wrap>
          <span>
            {text('fileConflict', 'A remote file with this name exists.')}
          </span>
          <Button
            onClick={() =>
              command({ type: 'conflict', id: progress.id, overwrite: false })
            }
          >
            {text('fileSkip', 'Keep remote file')}
          </Button>
          <Button
            danger
            onClick={() =>
              command({ type: 'conflict', id: progress.id, overwrite: true })
            }
          >
            {text('fileOverwrite', 'Overwrite remote file')}
          </Button>
        </Space>
      )}
      {localConflict && (
        <Space wrap>
          <span>
            {text('localFileConflict', 'A local file with this name exists.')}:{' '}
            {localConflict.entry.name}
          </span>
          <Button
            onClick={() => {
              setLocalConflict(undefined);
              ++operation.current;
            }}
          >
            {text('localKeepFile', 'Keep local file')}
          </Button>
          <Button
            danger
            onClick={() => {
              const pending = localConflict;
              if (
                pending.epoch === operation.current &&
                pending.fileGeneration === generation.current
              )
                void prepareDownload(
                  pending.entry,
                  pending.target,
                  true,
                  pending.epoch,
                );
            }}
          >
            {text('localOverwriteFile', 'Overwrite local file')}
          </Button>
        </Space>
      )}
    </div>
  );
});
