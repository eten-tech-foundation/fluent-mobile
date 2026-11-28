import { getUserOrgGrants } from '../services/userOrgGrants';
import { getTranslatorProjectIds } from './myWorkDraftDownload';

jest.mock('../services/userOrgGrants', () => ({
  getUserOrgGrants: jest.fn(),
}));

const mockGetUserOrgGrants = getUserOrgGrants as jest.MockedFunction<
  typeof getUserOrgGrants
>;

describe('myWorkDraftDownload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserOrgGrants.mockReturnValue({ status: 'unknown' });
  });

  it('derives Project Translator project IDs only from known grant snapshots', () => {
    expect(getTranslatorProjectIds('7')).toEqual([]);

    mockGetUserOrgGrants.mockReturnValue({
      status: 'known',
      grants: [
        {
          roleId: 4,
          orgId: 1,
          projectId: 3,
          roleName: 'Project Translator',
        },
        {
          roleId: 4,
          orgId: 1,
          projectId: null,
          roleName: 'Project Translator',
        },
        {
          roleId: 7,
          orgId: 1,
          projectId: 9,
          roleName: 'Project Observer',
        },
        {
          roleId: 4,
          orgId: 1,
          projectId: 3,
          roleName: 'Project Translator',
        },
      ],
    });
    expect(getTranslatorProjectIds('7')).toEqual([3]);

    mockGetUserOrgGrants.mockReturnValue({ status: 'known', grants: [] });
    expect(getTranslatorProjectIds('7')).toEqual([]);
  });
});
