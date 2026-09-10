export type PrivateItem = {
  id: string;
  title: string;
  content: string;
};

// 실제 개인정보가 아닌, 데모/제출용 합성(가짜) 데이터.
export function getSyntheticPrivateItems(displayName: string): PrivateItem[] {
  return [
    {
      id: 'item-1',
      title: `${displayName}님의 합성 프로젝트 메모`,
      content: '사이드 프로젝트 아이디어 초안입니다. (실제 데이터 아님, 데모용 합성 데이터)',
    },
    {
      id: 'item-2',
      title: '합성 비공개 일정',
      content: '2026-09-15 팀 회고 미팅 (가상 일정입니다)',
    },
    {
      id: 'item-3',
      title: '합성 학습 기록',
      content: 'WebAuthn/패스키 학습 노트 (가상 데이터입니다)',
    },
  ];
}
