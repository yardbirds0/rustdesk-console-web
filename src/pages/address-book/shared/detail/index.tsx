import { PageContainer } from '@ant-design/pro-components';
import { FormattedMessage, useNavigate, useParams } from '@umijs/max';
import { Button, Result, Spin } from 'antd';
import React, { useEffect, useState } from 'react';
import PersonalAddressBook from '@/pages/address-book/personal';
import { getWebSharedAddressBook } from '@/services/rustdesk-console/addressBook';
import { canWriteSharedAddressBook } from './access';

const SharedAddressBookDetail: React.FC = () => {
  const { guid } = useParams<{ guid: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<API.SharedAddressBook>();
  const [errorStatus, setErrorStatus] = useState<403 | 404 | 'error'>();

  useEffect(() => {
    let active = true;
    setProfile(undefined);
    setErrorStatus(undefined);

    if (!guid) {
      setErrorStatus(404);
      return () => {
        active = false;
      };
    }

    void getWebSharedAddressBook(guid)
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch((error: { response?: { status?: number } }) => {
        if (!active) return;
        const status = error?.response?.status;
        setErrorStatus(status === 403 || status === 404 ? status : 'error');
      });

    return () => {
      active = false;
    };
  }, [guid]);

  if (errorStatus) {
    return (
      <PageContainer>
        <Result
          status={
            errorStatus === 'error'
              ? 'error'
              : (String(errorStatus) as '403' | '404')
          }
          title={
            errorStatus === 'error' ? (
              <FormattedMessage
                id="pages.addressBook.loadFailed"
                defaultMessage="Failed to load address book"
              />
            ) : (
              errorStatus
            )
          }
          subTitle={
            <FormattedMessage
              id="pages.addressBook.loadFailed"
              defaultMessage="Failed to load address book"
            />
          }
          extra={
            <Button
              type="primary"
              onClick={() => navigate('/address-book/shared')}
            >
              <FormattedMessage id="pages.common.back" defaultMessage="Back" />
            </Button>
          }
        />
      </PageContainer>
    );
  }

  if (!profile) {
    return (
      <PageContainer>
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin />
        </div>
      </PageContainer>
    );
  }

  return (
    <PersonalAddressBook
      guid={profile.guid}
      title={profile.name}
      canWrite={canWriteSharedAddressBook(profile.rule)}
      onBack={() => navigate('/address-book/shared')}
    />
  );
};

export default SharedAddressBookDetail;
