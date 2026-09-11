export type PrivateItem = {
  id: string;
  title: string;
  content: string;
};

// 실제 개인정보가 아닌, 데모/제출용 합성(가짜) 데이터.
// 계정마다 내용이 달라야 교차 계정 조회 테스트에서 "남의 자료가 아니라 내 자료가
// 왔는지"를 눈으로도 구분할 수 있어서, displayName을 세 항목 모두에 반영한다.
export function getSyntheticPrivateItems(displayName: string): PrivateItem[] {
  return [
    {
      id: 'item-1',
      title: `${displayName}님의 합성 프로젝트 메모`,
      content: `${displayName}님의 사이드 프로젝트 아이디어 초안입니다. (실제 데이터 아님, 데모용 합성 데이터)`,
    },
    {
      id: 'item-2',
      title: `${displayName}님의 합성 비공개 일정`,
      content: `${displayName}님 기준 2026-09-15 팀 회고 미팅 (가상 일정입니다)`,
    },
    {
      id: 'item-3',
      title: `${displayName}님의 합성 학습 기록`,
      content: `${displayName}님의 WebAuthn/패스키 학습 노트 (가상 데이터입니다)`,
    },
  ];
}
