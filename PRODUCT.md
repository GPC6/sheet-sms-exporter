# Product
<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
구글 시트의 입금 상태를 기준으로 문자 발송 대상 엑셀을 준비하는 담당자.

## Product Purpose
소스 코드와 개발 도구 설치 없이 데스크톱 프로그램에서 로그인하고 엑셀을 만든다.

## Capabilities and Constraints
기존 저장소를 변경하지 않는 독립 프로젝트. Windows와 macOS 배포를 목표로 한다.
이름·연락처를 입금완료/미입금으로 구분해 두 엑셀을 만들고, 선택하면 입금완료 행을 완료로 표시한다.
실제 SMS 발송은 하지 않는다. 데이터는 로컬에서 처리한다. 교회 정보나 실제 명단을 포함하지 않는다.

## Implementation assumptions
기존 TypeScript 로직을 활용한 Electron 앱. 첫 버전은 링크 입력과 spreadsheets OAuth 권한을 사용한다.
앱 이름과 시각 디자인은 임시이며, 반복 작업에 맞는 한 화면 도구로 만든다.
