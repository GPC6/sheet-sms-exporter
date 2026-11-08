# 시트 문자 도우미

Google 계정으로 로그인하고 시트 링크를 저장해 문자 발송 대상 엑셀을 만드는 데스크톱 앱입니다. 실행에 Git, Node.js, 서비스 계정 키가 필요하지 않습니다. 이 프로젝트는 기존 시스템의 SMS 대상 분류·엑셀 생성 동작을 바탕으로 별도 폴더에 구현한 첫 버전입니다.

**현재 단계:** 0.1.0 테스트 배포. 로그인 설정을 포함한 Mac 앱에서 실제 Google 로그인과 세션 저장을 확인했습니다. 실제 시트 읽기·쓰기 검증과 배포 서명은 아직 남아 있습니다. Google OAuth 앱은 테스트 상태이므로 개발자가 등록한 테스트 계정만 로그인할 수 있습니다.

## 다운로드

[GitHub Releases에서 프로그램 다운로드](https://github.com/GPC6/sheet-sms-exporter/releases)

| 운영체제 | 다운로드 파일 |
| --- | --- |
| Windows 64비트 | `sheet-sms-exporter-0.1.0-win-x64.exe` 설치 프로그램 또는 같은 이름의 ZIP |
| Mac Apple Silicon (M 시리즈) | `sheet-sms-exporter-0.1.0-mac-arm64.dmg` 또는 같은 이름의 ZIP |
| Mac Intel | `sheet-sms-exporter-0.1.0-mac-x64.dmg` 또는 같은 이름의 ZIP |

GitHub가 자동으로 제공하는 `Source code` 대신 위 프로그램 파일을 받으세요. ZIP은 압축을 푼 뒤 앱을 실행하며, Git이나 Node.js를 설치할 필요가 없습니다. 현재 프로그램은 코드 서명·공증이 없어 운영체제에서 실행 경고나 차단이 발생할 수 있습니다.

## 사용자 흐름

1. Releases에서 운영체제에 맞는 프로그램을 내려받아 실행합니다.
2. `Google로 로그인`을 누르고 시스템 브라우저에서 로그인·시트 권한 승인을 마칩니다.
3. Google 스프레드시트 링크를 붙여 넣고 `불러오기`를 누릅니다.
4. 시트 탭, 상태 컬럼, 엑셀 저장 폴더를 확인합니다.
5. `대상 확인` 후 인원수를 확인하고 `엑셀 생성`을 누릅니다.

첫 행에 `이름`, `연락처`, 상태 컬럼(기본값 `문자송부여부`)이 있어야 합니다. `입금완료`와 `미입금` 상태를 구분하며 나머지는 제외합니다. 연락처는 0이 보존된 텍스트로 입력하세요. 한국 전화번호 또는 +국가번호 형식의 연락처를 허용합니다.

두 파일의 컬럼은 `PersonName`, `Cellular`입니다. 결과가 없는 구분은 헤더만 생성합니다. 전체 대상이 0명이면 생성하지 않습니다. 파일명은 한국 시간 기준 `mmdd_문자발송대상_입금완료자.xlsx`, `mmdd_문자발송대상_미입금자.xlsx`이고, 같은 이름이 있으면 `_2`, `_3` 순으로 저장합니다.

`생성 후 입금완료 행에 완료 표시`가 켜져 있으면 **두 파일을 저장한 뒤** 입금완료 행의 상태만 `완료(mm.dd)`로 갱신합니다. 미입금 상태는 유지합니다. 이 표시는 파일 생성 완료이며 실제 SMS 전송을 의미하지 않습니다. 실제 SMS 전송 기능은 포함하지 않습니다.

## 개발 실행

Node.js 22 이상(권장 24)을 사용합니다.

```sh
npm ci
npm start
```

Google 설정이 없어도 화면은 실행됩니다. 로그인 버튼은 설정이 포함된 빌드에서 활성화됩니다. `npm run check`로 타입 검사, 테스트, 빌드를 실행합니다. `npm run test:desktop`은 빌드 후 실제 Electron 창을 열어 초기 화면·샌드박스·차단된 IPC를 검사합니다.

## 개발자용 Google 로그인 설정

사용자마다 키를 발급받는 방식이 아닙니다. 앱 개발자가 한 번 준비합니다.

1. Google Cloud 프로젝트를 생성하고 Google Sheets API를 사용 설정합니다.
2. Google Auth Platform에서 앱 이름·지원 이메일·동의 화면을 설정합니다. 개인 Gmail 계정이 이용하면 Audience는 External입니다. 개발 중에는 테스트 사용자에 본인 계정을 추가합니다.
3. OAuth 클라이언트를 **Desktop app** 유형으로 생성합니다.
4. 다운로드한 `installed` 형식 JSON을 프로젝트 루트의 **oauth-config.json**으로 저장합니다. `oauth-config.example.json`은 형식 참고용이며 그대로는 로그인할 수 없습니다.
5. `npm start` 또는 다시 빌드한 앱으로 로그인합니다.

환경 변수 `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`로 빌드 설정을 넣을 수도 있습니다. Google 서비스 계정 JSON은 사용할 수 없으며 빌드가 거부합니다. 루트 OAuth 설정은 Git에서 제외하고, 빌드 시 필요한 Desktop client ID/secret만 앱에 들어갑니다. 데스크톱 OAuth 클라이언트는 공개 클라이언트이므로 그 설정을 추출할 수 없다고 가정하면 안 됩니다. **서비스 계정 private key, 사용자 토큰은 배포 파일에 절대 넣지 않습니다.**

요청 권한: `openid`, `email`, `https://www.googleapis.com/auth/spreadsheets`. 현재 버전은 링크 입력 편의를 위해 계정이 접근할 수 있는 모든 스프레드시트에 대한 읽기·수정 권한을 요청합니다. 저장한 링크 하나로 OAuth 권한이 제한되지는 않습니다. `drive.file`과 Google Picker를 통한 파일별 승인 방식은 이 버전에 구현하지 않았습니다.

External/Testing 상태에서 Sheets 권한으로 발급된 refresh token은 보통 7일 후 만료됩니다. 일반 사용자 배포 전에는 Google 앱 게시 상태·브랜드 검증·민감 권한 검증을 준비해야 합니다. 앱 소개와 개인정보 처리 안내를 실제 배포 방식에 맞게 게시하세요.

공식 문서: [Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Sheets 권한](https://developers.google.com/workspace/sheets/api/scopes), [배포 준비](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance), [토큰 만료](https://developers.google.com/identity/protocols/oauth2#expiration).

## 빌드와 배포

```sh
npm run pack
npm run dist
```

`pack`은 현재 운영체제의 실행 폴더를, `dist`는 설치·압축 배포 파일을 `release/`에 만듭니다. macOS는 .app을 포함한 ZIP/DMG, Windows는 설치 EXE/ZIP입니다. 사용자에게는 해당 파일만 제공합니다. 다른 운영체제 빌드는 GitHub Actions에서 각 운영체제 러너로 만듭니다.

Repository variable `GOOGLE_OAUTH_CLIENT_ID`와 Repository secret `GOOGLE_OAUTH_CLIENT_SECRET`을 설정합니다. `v0.1.0` 같은 태그를 푸시하면 Windows x64, macOS arm64/x64를 빌드해 SHA-256 체크섬과 함께 **Draft Release**에 첨부합니다. 빌드 결과를 확인한 뒤 릴리즈를 게시합니다. 수동 workflow 실행은 빌드 산출물만 만듭니다. OAuth 설정이 없으면 릴리즈 빌드는 실패합니다.

현재 배포 설정은 서명 인증서가 없는 테스트용입니다. macOS 공증/Developer ID 서명과 Windows 코드 서명은 별도 준비가 필요합니다. 미서명 앱은 Gatekeeper/SmartScreen 경고나 실행 차단이 발생할 수 있습니다. 이 저장소는 보안 기능을 해제하는 절차를 제공하지 않습니다. 정식 배포 전 워크플로에 서명·공증을 추가하세요. 자동 업데이트는 구현하지 않았습니다.

## 보관 데이터와 보안 범위

- 설정: Electron userData의 `settings.json`에 시트 링크·탭·상태 컬럼·저장 위치만 보관합니다.
- 인증: `session.enc`에 OAuth 토큰을 Electron safeStorage로 암호화합니다. macOS는 Keychain 기반, Windows는 DPAPI 기반입니다. 보안 저장소를 사용할 수 없으면 평문으로 대체하지 않습니다. 같은 사용자 권한으로 실행하는 악성 프로그램까지 방어한다는 의미는 아닙니다.
- 시트 행: 엑셀 생성 중 메모리에서만 사용합니다. 이름·연락처·토큰을 로그에 기록하지 않습니다. 대상 확인 화면에는 건수만 표시합니다.
- 통신: 앱은 Google 인증·Sheets API와 직접 통신합니다. 별도 앱 서버, 분석 추적, 원격 UI는 없습니다.
- UI: Node.js 접근을 막은 샌드박스, context isolation, 제한된 IPC, 로컬 전용 CSP를 사용합니다. OAuth는 기본 브라우저와 127.0.0.1 콜백, PKCE, state 검증을 사용합니다.
- 연결 해제: 로컬 토큰을 삭제하고 Google 토큰 취소를 요청합니다. 네트워크 실패 시 구글 계정의 연결된 앱 설정에서 해제할 수 있습니다.

대상 확인 이후 시트가 바뀌면 파일을 만들지 않습니다. 파일 생성 뒤 다시 검사해서 행 정렬·수정이 감지되면 시트 상태를 쓰지 않고 경고합니다. 다만 Google Sheets는 이 흐름에 원자적 조건부 쓰기를 제공하지 않으므로, 마지막 확인 직후의 동시 편집까지 완전히 막지는 못합니다. 생성 작업 중에는 해당 시트의 정렬·편집을 피하세요.

네트워크 오류로 상태 갱신 성공 여부가 불명확하면 파일은 남기고 결과 화면에 경고합니다. 이때 다시 생성하기 전에 원본 시트 상태를 확인하세요.

## 공개 전 확인

기존 레포의 `.git`, `.env`, 인증키, 실제 명단, 기존 템플릿, 내부 README는 가져오지 않았습니다. 빈 엑셀을 코드로 생성하므로 원본 템플릿의 작성자 정보도 포함하지 않습니다. 공개할 파일은 `git status`와 `git diff --cached`로 다시 확인하세요. 이 프로젝트는 소스 공개 라이선스를 임의로 지정하지 않았습니다. 원본 코드의 권리와 배포 라이선스는 공개 전에 정해야 합니다.

## 검증한 범위 (2026-10-27)

- TypeScript 검사와 31개 자동 테스트 통과: 번호 보존, 실제 XLSX 구조, 파일명 중복, 시트 변경 감지, 부분 실패, OAuth state/PKCE/권한 거절.
- 실제 Electron 실행과 샌드박스 확인. 예시 응답으로 대상 확인·생성·설정 변경 화면 흐름 확인.
- macOS Apple Silicon용 .app / ZIP / DMG 생성 및 패키징된 앱 실행 확인.
- 배포 아카이브에 실제 인증키·명단·기존 템플릿이 포함되지 않았는지 확인.
- 실제 Google 계정 인증과 시트 읽기·쓰기는 미검증. Google 응답을 모의한 테스트는 실제 Google 연동 검증을 대체하지 않습니다.
- Windows 및 Intel macOS 실행, GitHub Actions 원격 실행, 코드 서명·공증은 미검증/미설정입니다.

### Google 연결 설정 (2026-11-08)

별도 Cloud 프로젝트에 Sheets API, External/Testing 동의 화면, Desktop OAuth 클라이언트와 테스트 사용자를 등록했습니다. 개발 환경의 `oauth-config.json`은 Git에서 제외되며, 설정을 포함한 macOS arm64 APP/ZIP/DMG를 다시 생성했습니다. 타입 검사와 31개 자동 테스트를 다시 통과했습니다.

패키징한 앱에서 실제 Google 로그인·시트 권한 승인을 마치고 계정이 표시되는 것을 확인했습니다. 암호화 세션 파일도 소유자만 읽고 쓸 수 있는 권한(`0600`)으로 저장되었습니다. 실제 시트 읽기·쓰기는 아직 미검증입니다. 다른 계정으로 시험하려면 Google Auth Platform의 테스트 사용자 목록에 먼저 추가해야 합니다.
