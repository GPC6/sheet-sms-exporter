export class UserError extends Error {}

// Never forward raw Google errors: request objects may contain tokens and row data.
export function publicError(error: unknown): string {
  if (error instanceof UserError) return error.message;
  const value = error as { code?: string; response?: { status?: number; data?: { error?: string } } };
  if (value?.response?.status === 401 || value?.response?.data?.error === 'invalid_grant') return '구글 인증이 만료되었거나 해제되었습니다. 로그아웃 후 다시 로그인하세요.';
  if (value?.response?.status === 403) return '시트 접근 권한이 없습니다. 로그인 계정의 공유 권한과 앱의 Sheets API 설정을 확인하세요.';
  if (value?.response?.status === 404) return '시트를 찾을 수 없습니다. 링크와 공유 권한을 확인하세요.';
  if (value?.response?.status === 429) return '구글 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.';
  if (['EACCES', 'EPERM', 'ENOSPC', 'ENOENT'].includes(value?.code ?? '')) return '파일을 저장할 수 없습니다. 저장 폴더의 권한과 여유 공간을 확인하세요.';
  return '작업을 완료하지 못했습니다. 인터넷 연결과 시트 설정을 확인한 뒤 다시 시도하세요.';
}
