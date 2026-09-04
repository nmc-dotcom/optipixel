# optipixel

브라우저에서 바로 쓰는 전문 픽셀 아트 스튜디오입니다. React 19 + TypeScript +
Vite로 만들어졌으며, 이미지 도트 변환부터 레이어 편집, 애니메이션 미리보기,
소스코드 추출까지 픽셀 아트 제작에 필요한 도구를 한 화면에서 제공합니다.

## 주요 기능

- **이미지 → 도트 변환**: 사진/이미지를 업로드해 지정한 해상도와 색상 수로
  픽셀 아트로 변환합니다. Floyd-Steinberg / Bayer / Atkinson 디더링, 엣지
  보존 다운스케일링, 밝기·대비·채도 조정을 지원합니다. 자동 맞춤(Fit / Crop /
  Stretch) 외에 **직접 배치** 모드로 프리뷰를 드래그해 위치를 옮기고 배율로
  크기를 맞출 수 있습니다.
- **레이어 & 그룹**: 여러 레이어를 그룹으로 묶어 관리하고, 표시/숨김, 잠금,
  불투명도, 병합, 순서 이동을 지원합니다.
- **커스텀 팔레트**: 레트로/모던 프리셋 팔레트를 쓰거나 직접 만든 팔레트를
  브라우저에 저장해 재사용할 수 있습니다.
- **애니메이션 프리뷰**: 레이어를 프레임으로 활용해 루프 / 핑퐁 / 1회 재생
  모드로 애니메이션을 실시간 미리볼 수 있습니다 (어니언 스킨 지원).
- **스트라이프(스프라이트 시트) 내보내기**: 가로/세로/그리드 레이아웃으로
  스프라이트 시트를 PNG로 내보냅니다.
- **소스코드 추출**: 완성한 픽셀 아트를 CSS, Canvas, SVG, JS 2차원 배열,
  Arduino(RGB565) 코드로 바로 추출합니다.
- **필터**: 회전, 반전, 밝기/대비/채도 등 다양한 후처리 필터를 제공합니다.

## 로컬에서 실행하기

**사전 준비:** Node.js

1. 의존성 설치:
   ```
   npm install
   ```
2. 개발 서버 실행:
   ```
   npm run dev
   ```
3. 브라우저에서 `http://localhost:3000` 접속

## 그 외 명령어

- `npm run build` — 프로덕션 빌드
- `npm run preview` — 빌드 결과 로컬 미리보기
- `npm run lint` — TypeScript 타입 체크
- `npm test` — 테스트 실행 (`npm run test:watch`로 감시 모드)

## 브라우저로 확인하기

실제 브라우저(Playwright + Chromium)로 앱을 띄워 스크린샷을 남기고 콘솔 오류를
잡을 수 있습니다.

```
npm run browser                      # 에디터 첫 화면을 screenshots/에 캡처
node scripts/browser.mjs --out /tmp  # 저장 위치 지정
node scripts/browser.mjs --headed    # 창을 띄워서 보기 (X 서버 필요)
```

dev 서버가 이미 떠 있으면 그것을 쓰고, 없으면 직접 띄웠다가 끝나면 정리합니다.
콘솔 오류나 처리되지 않은 예외가 있으면 목록으로 보고하고 종료 코드 1을 냅니다.

**최초 1회 준비** — Chromium 바이너리는 `npm install`로 받아지지 않고, 실행에
필요한 시스템 라이브러리(94개)도 따로 깔아야 합니다.

```
npx playwright install chromium             # 브라우저 바이너리 (~/.cache/ms-playwright)
sudo npx playwright install-deps chromium   # 시스템 라이브러리 (root 필요)
```

브라우저 바이너리는 반드시 **사용자 계정으로** 받아야 합니다. `sudo`로 받으면
root의 캐시에 들어가 앱에서 찾지 못합니다.

root를 쓸 수 없는 환경(권한 없는 컨테이너 등)이라면 두 번째 줄 대신:

```
bash scripts/setup-browser-sysroot.sh
```

같은 .deb들을 `~/.local/share/chromium-sysroot`에 풀어두고, `scripts/browser.mjs`가
그 경로를 자동으로 찾아 `LD_LIBRARY_PATH`로 물려줍니다. 시스템에 정식으로 설치돼
있으면 이 디렉터리가 없으므로 그냥 기본 환경을 씁니다.

## 테스트

픽셀 좌표 계산, 프로젝트 직렬화, 외부 입력 파싱처럼 조용히 틀리기 쉬운 순수 함수를
[vitest](https://vitest.dev)로 검증합니다.

- `src/utils/pixelEngine.test.ts` — 선택 영역 좌표 연산(역방향 드래그, 경계 클램프,
  붙여넣기 잘림)과 색상 변환
- `src/utils/projectStorage.test.ts` — 프로젝트 RLE 압축 왕복, 손상된 파일 방어
- `src/utils/lospec.test.ts` — Lospec 슬러그 파싱과 팔레트 변환
- `src/utils/imageConverter.test.ts` — 이미지 배치 계산(레터박스, 수동 배율/오프셋 클램프)
- `src/utils/history.test.ts` — 실행취소 스냅샷의 copy-on-write 공유 규약과 단계 한도
- `src/utils/filterEngine.test.ts` — 외곽선 생성과 색상 단위 필터 메모이제이션
