# 09 — 소스 공개 상태와 배포 접근성 (T08-C02, C03)

## C02 — 소스 URL 필드에 HTTPS URL 한 개가 제출되어 있다

```
https://github.com/shk12170-dev/t08-passkey-portfolio
```

## C03 — 결과물·소스 URL이 계정 생성/로그인/인증/초대/비밀번호/OAuth/CAPTCHA 없이 열린다

```
요청: GET https://github.com/shk12170-dev/t08-passkey-portfolio (쿠키 없음)
응답 상태: 200

요청: GET https://t08-passkey-portfolio-three.vercel.app (쿠키 없음)
응답 상태: 200
```

- GitHub 저장소는 **Public**으로 설정되어 있다(`gh repo view` 결과 `"visibility":"PUBLIC"`).
  로그인 없이도 코드·커밋 이력·README를 전부 볼 수 있다.
- Vercel 배포는 "Deployment Protection"(비밀번호/팀원 전용 보호)이 걸려 있지 않은
  일반 Production 배포이므로, 시크릿 창에서 바로 열린다.
- 결과물 첫 화면(`/`)은 등록·로그인 자체가 필요 없는 공개 소개 페이지다(`01-public-private-boundary.md`
  C10 참고).
