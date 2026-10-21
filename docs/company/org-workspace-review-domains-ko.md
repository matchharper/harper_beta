# Org Workspace 가입 검토 — 도메인 조사 및 구현 계약

조사 기준: 2026-10-20. 운영 반영 확인: 2026-10-21, 웹 revision `8b529ab3`와 DB migration `20261021014931`.

## 범위와 확인 수준

현재 로컬 등록 대상은 **126개 도메인**이다. 국내 채용 플랫폼, 서치펌·헤드헌팅, 채용 소프트웨어·평가, 인재 파견·채용 대행과 한국 사업이 확인되는 글로벌 채용 기업을 포함한다. 내부 팀원 성과·근태·인사관리만 제공하는 서비스는 제외하며, 채용 기능도 제공하는 업체는 포함한다. 회사명은 식별을 위한 서비스/브랜드명이며 법인 수와 도메인 수는 다르다.

- `공식 이메일`은 공식 사이트 연락처에서 해당 이메일 도메인을 확인한 경우다. 전 팀원의 업무 이메일이 동일하다는 뜻은 아니다.
- `공식 웹사이트`는 공식 서비스나 회사 사이트 또는 공식 리디렉션으로 소유·업종을 확인한 경우다. 실제 업무 이메일 사용은 별도 확인이 필요하다.
- 서비스 도메인과 회사 도메인이 다르면 함께 수록했다. 진학사·인프랩·그렙·무하유·트랜스코스모스·코드잇처럼 다른 사업도 하는 회사는 채용 관련 사업을 함께 제공하므로 포함했다. 해당 도메인의 비채용 사업부도 검토 대상이 된다.
- 국내 전체 HR 업체·개별 헤드헌터와 모든 업무 이메일 도메인의 완전한 명부는 아니다. 미등록 별도 도메인으로 가입하면 이 방식만으로는 구분할 수 없다. 공용 이메일 제공자 전체를 목록에 넣으면 안 된다.
- 근거 페이지를 직접 확인해 선정했다. 오래된 디렉터리의 도메인 추정값이나 HTTP 200 응답만으로 자동 등록하지 않았다. 출처와 확인일은 `src/lib/org/workspaceReviewDomains.json`에도 있다.

## 등록 목록

### 채용 플랫폼·커리어 서비스 — 29개

| 회사·서비스 | 도메인 | 확인 근거 |
|---|---|---|
| 그룹바이 | `groupby.kr` | [공식 웹사이트](https://groupby.kr/positions) |
| 그룹바이 | `groupby.biz` | [공식 이메일](https://groupby.kr/positions) |
| 사람인 | `saramin.co.kr` | [공식 웹사이트](https://www.saramin.co.kr/zf_user/) |
| 잡코리아 | `jobkorea.co.kr` | [공식 이메일](https://www.jobkorea.co.kr/) |
| 원티드랩 | `wantedlab.com` | [공식 이메일](https://www.wantedlab.com/) |
| 원티드 | `wanted.co.kr` | [공식 웹사이트](https://www.wanted.co.kr/) |
| 리멤버 | `remember.co.kr` | [공식 웹사이트](https://career.rememberapp.co.kr/job/postings) |
| 리멤버앤컴퍼니 (기존 드라마앤컴퍼니) | `dramancompany.com` | [공식 웹사이트](https://dramancompany.com/) |
| 로켓펀치 | `rocketpunch.com` | [공식 웹사이트](https://www.rocketpunch.com/) |
| 잡플래닛 | `jobplanet.co.kr` | [공식 웹사이트](https://www.jobplanet.co.kr/welcome/index) |
| 인크루트 | `incruit.com` | [공식 이메일](https://www.incruit.com//) |
| 커리어넷 | `career.co.kr` | [공식 이메일](https://career.co.kr/) |
| 피플앤잡 | `peoplenjob.com` | [공식 웹사이트](https://www.peoplenjob.com/) |
| 슈퍼루키 | `superookie.com` | [공식 웹사이트](https://superookie.com/) |
| 점핏 | `jumpit.co.kr` | [공식 이메일](https://jumpit.saramin.co.kr/) |
| 랠릿 | `rallit.com` | [공식 웹사이트](https://www.rallit.com/) |
| 자소설닷컴 | `jasoseol.com` | [공식 웹사이트](https://jasoseol.com/) |
| 직행 | `zighang.com` | [공식 이메일](https://zighang.com/recruitment) |
| 진학사 캐치 | `catch.co.kr` | [공식 웹사이트](https://www.catch.co.kr/) |
| 리크루트 | `recruit.co.kr` | [공식 이메일](http://www.recruit.co.kr/) |
| 링커리어 | `linkareer.com` | [공식 웹사이트](https://linkareer.com/) |
| 알바몬 | `albamon.com` | [공식 이메일](https://www.albamon.com:443/) |
| 알바천국 | `alba.co.kr` | [공식 이메일](https://www.alba.co.kr/) |
| 커리어리 | `careerly.co.kr` | [공식 웹사이트](https://careerly.co.kr/) |
| 리멤버 | `rememberapp.co.kr` | [공식 웹사이트](https://business.rememberapp.co.kr/) |
| 그렙 | `grepp.co` | [공식 웹사이트](https://www.grepp.co/) |
| 진학사·캐치 | `jinhak.com` | [공식 웹사이트](https://www.catch.co.kr/) |
| 인프랩 | `inflab.com` | [공식 웹사이트](https://story.inflab.com/) |
| 인프랩·랠릿 | `inflearn.com` | [공식 이메일](https://www.inflab.com/) |

### 국내 서치펌·헤드헌팅 — 29개

| 회사·서비스 | 도메인 | 확인 근거 |
|---|---|---|
| 캔디드 | `teamcandid.kr` | [공식 이메일](https://teamcandid.kr/) |
| 커리어케어 | `careercare.co.kr` | [공식 이메일](https://www.careercare.co.kr/) |
| 유니코써치 | `unicosearch.com` | [공식 이메일](http://www.unicosearch.com/home) |
| 엔터웨이파트너스 | `nterway.com` | [공식 웹사이트](https://nterway.com/) |
| HR맨파워그룹 | `hrman.co.kr` | [공식 웹사이트](https://www.hrman.co.kr/home/ko/candidateSrvc/careerType.do) |
| 피플케어코리아 | `peoplecare.co.kr` | [공식 이메일](https://peoplecare.co.kr/) |
| 스카우트 | `scout.co.kr` | [공식 웹사이트](https://scout.co.kr/) |
| 스카우트파트너스 | `scoutpartners.co.kr` | [공식 이메일](https://www.scoutpartners.co.kr/) |
| HRKOREA | `hrkorea.co.kr` | [공식 웹사이트](https://hrkorea.co.kr/) |
| 커리어앤스카우트 | `cnscout.co.kr` | [공식 이메일](https://cnscout.co.kr/) |
| 브리스캔영 | `briskyoung.com` | [공식 웹사이트](https://www.briskyoung.com/) |
| 잡뉴스솔로몬서치 | `solomonsearch.co.kr` | [공식 웹사이트](https://www.solomonsearch.co.kr/) |
| 잡뉴스솔로몬서치 | `jobnews.co.kr` | [공식 이메일](https://www.solomonsearch.co.kr/) |
| 써치앤컴퍼니 | `searchncompany.com` | [공식 이메일](https://searchncompany.com/) |
| 맨쉬컨설팅 | `menschconsulting.co.kr` | [공식 웹사이트](https://menschconsulting.co.kr/) |
| 프로핸즈코리아 | `prohanzkorea.com` | [공식 웹사이트](https://www.prohanzkorea.com/) |
| 프로핸즈코리아 | `prohanzkorea.co.kr` | [공식 이메일](https://prohanzkorea.com/) |
| 베스트네트워크 | `bestnetwork.net` | [공식 웹사이트](https://www.bestnetwork.net/ver1/resume_download.asp?sfile=Company+Profile_Best+Network+Corporation.pdf) |
| 베스트파트너스 | `bestpartners.co.kr` | [공식 웹사이트](https://bestpartners.co.kr/) |
| HR캡 | `hrcap.com` | [공식 이메일](https://www.hrcap.com/) |
| HR비즈코리아 | `hrbiz.co.kr` | [공식 웹사이트](https://hrbiz.co.kr/) |
| 벤처피플 | `venturepeople.co.kr` | [공식 웹사이트](http://www.venturepeople.co.kr/) |
| HR컨설팅그룹 | `hrcg.co.kr` | [공식 이메일](https://www.hrcg.co.kr/) |
| HR포유 | `hr4u.co.kr` | [공식 이메일](http://www.hr4u.co.kr/) |
| 스타팅 | `starting.kr` | [공식 이메일](https://starting.kr/) |
| 히든스카우트 | `hiddenscout.co.kr` | [공식 이메일](https://www.hiddenscout.co.kr/) |
| 핀커스코리아 | `pincus.co.kr` | [공식 웹사이트](https://www.pincus.co.kr/) |
| 휴먼디지탈 | `hdsearch.co.kr` | [공식 웹사이트](https://www.hdsearch.co.kr/main/main.php) |
| 서치라이트AI | `searchright.net` | [공식 이메일](https://www.searchright.net/) |

### 글로벌 채용·서치펌 — 7개

| 회사·서비스 | 도메인 | 확인 근거 |
|---|---|---|
| 콘페리 | `kornferry.com` | [공식 웹사이트](https://www.kornferry.com/about-us/consultants/michael-choi) |
| 하이드릭앤스트러글스 | `heidrick.com` | [공식 웹사이트](https://www.heidrick.com/en/offices/seoul) |
| 에곤젠더 | `egonzehnder.com` | [공식 웹사이트](https://www.egonzehnder.com/office/seoul) |
| 로버트월터스코리아 | `robertwalters.co.kr` | [공식 웹사이트](https://www.robertwalters.co.kr/about-us.html) |
| 로버트월터스 | `robertwalters.com` | [공식 웹사이트](https://www.robertwalters.co.kr/about-us.html) |
| 마이클페이지코리아 | `michaelpage.co.kr` | [공식 웹사이트](https://www.michaelpage.com/) |
| 페이지그룹 | `page.com` | [공식 웹사이트](https://investors.michaelpage.com/) |

### HR 소프트웨어·평가·컨설팅 — 16개

| 회사·서비스 | 도메인 | 확인 근거 |
|---|---|---|
| 나인하이어 | `ninehire.com` | [공식 이메일](https://www.ninehire.com/) |
| 그리팅·두들린 | `doodlin.co.kr` | [공식 웹사이트](https://www.doodlin.co.kr/ko/career) |
| 그리팅 | `greetinghr.com` | [공식 웹사이트](https://www.greetinghr.com/) |
| 플렉스 | `flex.team` | [공식 이메일](https://flex.team/) |
| 뉴플로이 | `newploy.net` | [공식 이메일](https://www.newploy.net/) |
| 잡다 | `jobda.im` | [공식 이메일](https://www.jobda.im/) |
| 스펙터 | `specter.co.kr` | [공식 이메일](https://www.specter.co.kr/) |
| 위크루트 | `wecruitcorp.com` | [공식 웹사이트](https://www.wecruitcorp.com/) |
| 휴먼컨설팅그룹 | `e-hcg.com` | [공식 웹사이트](https://e-hcg.com/) |
| 프로그래머스 | `programmers.co.kr` | [공식 웹사이트](https://programmers.co.kr/) |
| 무하유 | `muhayu.com` | [공식 웹사이트](https://www.muhayu.com/) |
| 무하유 | `copykiller.com` | [공식 이메일](https://www.muhayu.com/) |
| 라운드HR | `roundhr.com` | [공식 웹사이트](https://www.roundhr.com/) |
| 코드잇·라운드HR | `codeit.com` | [공식 이메일](https://www.roundhr.com/) |
| 제네시스랩·뷰인터HR | `genesislab.ai` | [공식 이메일](https://viewinterhr.com/) |
| 뷰인터HR | `viewinterhr.com` | [공식 웹사이트](https://viewinterhr.com/) |

### 인재 파견·채용 대행 — 45개

| 회사·서비스 | 도메인 | 확인 근거 |
|---|---|---|
| 맨파워코리아 | `manpower.co.kr` | [공식 웹사이트](https://manpower.co.kr/) |
| 아데코코리아 | `adecco.co.kr` | [공식 웹사이트](https://www.adecco.com/ko-kr) |
| 아데코 | `adecco.com` | [공식 웹사이트](https://www.adecco.com/ko-kr) |
| 퍼솔켈리 | `persolkelly.kr` | [공식 웹사이트](https://www.persolkorea.com/) |
| 퍼솔코리아 | `persolkorea.com` | [공식 웹사이트](https://www.persolkorea.com/) |
| JAC리크루트먼트코리아 | `jac-recruitment.kr` | [공식 이메일](https://www.jac-recruitment.kr/) |
| 제니엘 | `zeniel.co.kr` | [공식 이메일](https://www.zeniel.com/ko/) |
| 키스템프그룹 | `kistemp.co.kr` | [공식 웹사이트](https://www.kistemp.co.kr/pages/main.asp) |
| 트랜스코스모스코리아 | `trans-cosmos.co.kr` | [공식 웹사이트](https://www.trans-cosmos.co.kr/ko/main) |
| NHR | `nhr.kr` | [공식 이메일](https://nhr.kr/privacy250915) |
| 유니에스 | `unies.com` | [공식 웹사이트](https://www.unies.com/web/company/map/networkView?gubn=5) |
| 인코스파트너스 | `incoskorea.com` | [공식 웹사이트](https://www.incoskorea.com/) |
| 위펀·파견24 | `wefun-corp.com` | [공식 웹사이트](https://www.wefun-corp.com/pagyeon) |
| 위펀·파견24 | `snack24h.com` | [공식 이메일](https://www.wefun-corp.com/pagyeon) |
| 에프앤비네트웍스·잡아라잡 | `fnbnetworks.co.kr` | [공식 웹사이트](https://fnbnetworks.co.kr/) |
| 에프앤비네트웍스·잡아라잡 | `jobarajob.kr` | [공식 웹사이트](https://www.jobarajob.kr/) |
| 엠피씨플러스 | `mpc.co.kr` | [공식 웹사이트](https://www.mpc.co.kr/business/providing.html) |
| 케이웍스코리아 | `korea-works.co.kr` | [공식 이메일](https://korea-works.co.kr/57) |
| 휴비즈넷 | `hubiz.net` | [공식 웹사이트](https://www.hubiz.net/) |
| 휴비즈넷 | `joinshr.com` | [공식 이메일](https://www.hubiz.net/) |
| 영주솔루션 | `youngjucorp.co.kr` | [공식 이메일](https://youngjucorp.co.kr/) |
| 파인퍼스트 | `fine-group.co.kr` | [공식 이메일](https://fine-group.co.kr/33) |
| 삼원이엔씨 | `samoneenc.com` | [공식 웹사이트](https://www.samoneenc.com/) |
| 디비솔루션 | `dbsolution.ai.kr` | [공식 웹사이트](https://dbsolution.ai.kr/) |
| 코네트리 | `conetri.com` | [공식 웹사이트](https://www.conetri.com/) |
| 휴먼케이 | `human-k.co.kr` | [공식 웹사이트](https://www.human-k.co.kr/) |
| 휴먼세이프코리아 | `humansafekorea.com` | [공식 웹사이트](https://humansafekorea.com/) |
| 원픽리더스 | `onepickhr.com` | [공식 웹사이트](https://onepickhr.com/24) |
| 엠제이플렉스 | `mjplex.com` | [공식 웹사이트](https://www.mjplex.com/) |
| 엠제이플렉스 | `mjplex.co.kr` | [공식 이메일](https://www.mjplex.com/) |
| 스탭스 | `staffs.co.kr` | [공식 웹사이트](https://www.staffs.co.kr/) |
| 애드민 | `admin4u.co.kr` | [공식 이메일](https://blog.admin4u.co.kr/sample-page/) |
| IMG인사이드 | `insidejob.co.kr` | [공식 웹사이트](https://www.insidejob.co.kr/) |
| 개미인력개발 | `job19.co.kr` | [공식 웹사이트](https://job19.co.kr/) |
| 개미인력개발 | `gaemi19.com` | [공식 웹사이트](https://gaemi19.com/newimg/com20170602.pdf) |
| 세이프원 | `safe1.co.kr` | [공식 웹사이트](https://safe1.co.kr/) |
| 피엘코리아 | `plkinsight.com` | [공식 웹사이트](https://plkinsight.com/) |
| 성강개발 | `skjob.kr` | [공식 웹사이트](https://skjob.kr/) |
| 한국EMS | `koreaems.co.kr` | [공식 웹사이트](https://koreaems.co.kr/) |
| 스카우트HR | `scouthr.co.kr` | [공식 웹사이트](https://scouthr.co.kr/) |
| 스카우트EMS | `scoutems.co.kr` | [공식 웹사이트](https://scoutems.co.kr/) |
| 대신산업관리 | `dshin.co.kr` | [공식 웹사이트](https://www.dshin.co.kr/business) |
| 파인테크 | `finetech-os.co.kr` | [공식 웹사이트](https://finetech-os.co.kr/) |
| 미래앤피플 | `mrnp.co.kr` | [공식 웹사이트](https://www.mrnp.co.kr/mrnp/business.php?pageCode=design&subCode=m2) |
| 잡인피플컨설팅 | `jipct.co.kr` | [공식 웹사이트](https://jipct.co.kr/page/sub02_1) |

## 혼동하기 쉬운 주소 및 보류 대상

| 대상 | 판단 |
|---|---|
| 캔디드 | `teamcandid.kr` 등록. `candid.kr`을 추정으로 대체하지 않는다. [공식 사이트](https://teamcandid.kr/) |
| 브리스캔영 | `briskyoung.com` 등록. `briscan.com`, `bnysearch.com`은 현행 공식 주소로 확인하지 못해 제외. [공식 사이트](https://www.briskyoung.com/) |
| 프로핸즈코리아 | `prohanzkorea.com`과 공식 연락처의 `prohanzkorea.co.kr` 등록. `prohanz.co.kr` 제외. [공식 사이트](https://prohanzkorea.com/) |
| 맨쉬컨설팅 | `menschconsulting.co.kr` 등록. `mensch.co.kr` 제외. [공식 사이트](https://www.menschconsulting.co.kr/) |
| 휴먼디지탈 | `hdsearch.co.kr` 등록. `hdi21.com`은 현재 통역학원 사이트여서 제외. [공식 사이트](https://www.hdsearch.co.kr/main/main.php) |
| 켈리·퍼솔 | 현재 연결이 확인된 `persolkelly.kr`, `persolkorea.com` 등록. `kelly.co.kr`은 다른 사이트로 연결돼 제외. [현행 사이트](https://www.persolkorea.com/) |
| 잡허브 추정 주소 | `jobhub.kr`은 가구 관련 사이트여서 제외. |
| 알리콘 | 현재 `alicorn.team`은 공간 운영 AI 소개. 로켓펀치 현재 하단의 운영사 표시와 다르므로 이전 관계만으로 등록하지 않음. [알리콘](https://alicorn.team/) · [로켓펀치](https://www.rocketpunch.com/) |
| 어센트코리아·핵클 | `ascentkorea.com`, `hackle.io`는 현재 마케팅·제품 최적화 사업으로 확인되어 제외. |
| 브레인커머스·앵커리어·퍼블리·마이다스인 | `braincommerce.com`, `anchoreer.com`, `publy.co`, `midasin.com`, `midashri.com`은 현행 업무 이메일 도메인과 공식 연결을 추가 확인해야 한다. 잡플래닛·자소설·커리어리·잡다의 확인된 서비스 주소는 등록. |
| 커리어커넥트·유어사이드·HR컨설팅·HR파트너스·커리어텍·휴먼링크 | `careerconnect.co.kr`, `yourside.co.kr`, `hrcon.co.kr`, `hrpartners.co.kr`, `careertech.co.kr`, `humanlink.co.kr`은 본문 제한·렌더링·접속 문제로 이번 자동 등록에서 보류. 회사가 HR 업체가 아니라는 판단은 아님. |
| 유니에스 | 공식 사이트의 직업소개사업 및 기업채용 안내를 확인해 `unies.com` 등록. [공식 사이트](https://www.unies.com/web/company/map/networkView?gubn=5) |
| 제네시스랩 | 뷰인터HR의 채용 평가 기능과 공식 연락처 `Sales@genesislab.ai`를 확인해 `genesislab.ai`, `viewinterhr.com` 등록. [공식 사이트](https://viewinterhr.com/) |
| 레몬베이스·디웨일(클랩)·시프티 | 내부 팀원 성과·근태 관리 중심인 `lemonbase.com`, `clap.company`, `shiftee.io`는 제외. 채용 솔루션 연동만으로 등록하지 않는다. |
| 플렉스·뉴플로이·휴먼컨설팅그룹 | [flex 채용 관리](https://flex.team/landing/service/recruiting), [뉴플로이 채용 홈페이지·입사지원 접수](https://www.newploy.net/), [HCG 후보자 탐색·매칭](https://e-hcg.com/solutions/elizax)을 제공하므로 유지. |
| 라운드HR·코드잇 | 공식 운영사 및 연락처 `suport-roundhr@codeit.com`을 확인해 `roundhr.com`, `codeit.com` 등록. 코드잇의 교육 사업 팀원도 같은 도메인이면 검토 대상이다. [공식 사이트](https://www.roundhr.com/) |
| 기타 글로벌 서치펌 | `spencerstuart.com`, `russellreynolds.com`, `boyden.com`, `odgers.com`, `aimsinternational.com`, `lhh.com`, `stantonchase.com`, `rgf-hragent.asia`는 글로벌 확대 후보. 이번 조사에서 현행 한국 사업 범위까지 일관되게 확인하지 못해 초기 목록에서는 보류. |

## 구현된 동작

1. 서버가 인증된 생성자의 검증 완료 이메일을 읽고 코드 목록으로 판정한다. DB는 최초 생성 트랜잭션에서 동일한 검증 이메일인지 확인하고 결과를 함께 저장한다. 사용자가 입력한 회사명·홈페이지·클라이언트 전달 이메일로 심사 여부를 결정하지 않는다.
2. 소문자로 정규화한 이메일 호스트를 등록 도메인 또는 그 하위 도메인과 비교한다. `foo.agency.example`은 `agency.example`에 해당하지만 `notagency.example`이나 `agency.example.attacker.test`는 해당하지 않는다.
3. 일치하면 `company_workspace.is_reviewing=true`, `review_domain`을 저장한다. 기존 Workspace에는 자동 소급하지 않는다. 새 조직 추가도 생성자 이메일로 판단한다.
4. 프로필·회사 정보·Pitch 입력과 온보딩 완료는 허용한다. 검토 대상은 Slack 연결·유료 플랜 선택을 건너뛰고, 결제 없이 완료할 수 있도록 기존 free 플랜 완료 조건을 충족한다.
5. 완료 후 `/org/home`에 검토 카드만 표시한다. 다른 Org 페이지로 직접 들어와도 검토 카드로 제한하며, 서버 API·Slack OAuth·직접 Data API 접근에도 검토 경계를 둔다. 새 역할 생성도 차단한다.
6. 검토 중에는 후보자·역할·팀원 목록·결제 정보를 bootstrap에 실어 보내지 않는다. 본인의 온보딩 정보와 회사 설정만 제공한다. Pitch 작성은 기존 LLM을 쓰며 회사 정보 읽기와 Pitch 저장만 허용한다.
7. 가입 알림은 일반 가입/검토 대상 모두 **Workspace 최초 생성 단위 1회**다. 로그인·새로고침·온보딩 완료·팀원 추가에서는 다시 보내지 않는다. 기존 사용자가 새 조직을 만들면 별도 Workspace 가입으로 1회 알린다.
8. 알림은 기존 `SLACK_COMPANY_NOTIFICATION_TOKEN` 웹훅 목적지로 보낸다. 회사명, 가입 이메일·도메인, 검토 여부·일치 도메인, Workspace ID를 포함한다. 이 설정이 실제 company notification 채널을 가리키는지는 배포 시 확인해야 한다.
9. 회사별 Slack 연결 및 Slack 환영 메시지는 검토 중 생성·전송하지 않는다. 자동 승인·자동 거절·24시간 내 회신을 약속하지 않는다.

## 운영과 적용

- 도메인 목록의 단일 원본은 [`src/lib/org/workspaceReviewDomains.json`](../../src/lib/org/workspaceReviewDomains.json)이다. 등록 도메인의 회사명·출처도 이 파일에 있다. 서버의 `signupReview.server.ts`가 이 파일을 직접 import한다. 별도 목록 테이블이나 SQL seed는 없다.
- `supabase/migrations/20261020024534_org_workspace_review.sql`은 판정 결과·알림 기록 저장, 생성 트랜잭션과 접근 권한 경계만 담당한다.
- 2026-10-21 웹과 운영 DB에 적용했다. 검토 컬럼·활성 트리거 2개·제한 정책 31개와 서버 전용 함수 권한을 확인했다. 기존 Workspace를 검토 대상으로 재분류하지 않았으며, 중단된 공개 셀프 가입은 재개하지 않았다. 운영 알림 설정의 존재는 확인했지만 실제 가입 생성·Slack 발송은 검증하지 않았다.
- 목록을 바꾸려면 `src/lib/org/workspaceReviewDomains.json`의 항목을 추가·수정·제거한다. 이 문서의 조사 표는 조사 당시 스냅샷이고, 실제 판정은 JSON이 기준이다. `domain`은 소문자 호스트만 저장하고 프로토콜·경로·`@`·와일드카드·공용 이메일 도메인을 넣지 않는다. 출처와 회사명을 함께 기록한다. 목록 변경은 코드 배포 후 새 가입부터 반영된다. 환경변수 변경이나 목록 데이터의 DB 반영은 필요 없다.
- 목록 변경은 **향후 생성**에 적용된다. 이미 판정된 Workspace를 재분류하거나 기존 HR 고객을 일괄 차단하지 않는다. 필요하면 별도의 정확한 Workspace ID를 대상으로 운영 판단 후 처리한다.
- 승인할 때는 운영 권한으로 해당 Workspace의 `is_reviewing=false`를 저장한다. 일반 팀원 API에서는 이 값을 수정할 수 없다. 이후 새로고침부터 기존 이용 권한이 적용된다. 과거 가입 알림은 다시 보내지 않는다. Slack을 자동으로 생성하거나 열지도 않는다.
- 별도 관리자 심사 화면은 추가하지 않았다. 운영 검토와 해제는 기존 DB 운영 경로를 사용한다.

## 알림 중복 방지와 장애 처리

`signup_notification`은 최초 가입의 이메일·도메인·판정과 전달 상태를 보존하는 durable 기록이다. 별도 이벤트 테이블은 만들지 않았다. 동일 Workspace에 대한 원자적 claim으로 동시 요청의 중복 발송을 막는다.

- `pending`: 아직 발송하지 않음. 최초 응답 후 즉시 시도하고 기존 5분 주기 dispatch가 누락을 회수한다. 설정 누락은 claim 전에 실패하므로 보류 상태를 유지한다.
- `sending`: 발송권을 확보함. 전송 도중 프로세스가 종료되면 이 상태가 남을 수 있다. 오래된 항목을 무조건 재발송하지 않는다.
- `sent`: Slack이 성공 응답한 사실과 시간을 보관한다.
- `uncertain`: 타임아웃 또는 성공 여부가 분명하지 않은 응답. 자동 재발송하지 않는다. 로그의 Workspace ID와 실제 채널 기록을 대조한 후, 이미 도착한 경우 `sent`, 확실히 도착하지 않은 경우에만 `pending`으로 조정한다.
- Slack 429 거절은 5분 후 재시도한다. 웹훅은 외부 시스템과 DB를 하나의 트랜잭션으로 묶을 수 없어 장애 상황까지 수학적인 exactly-once를 보장하지 않는다. 중복 방지를 우선하고 불명확한 경우 수동 대조한다.

## 검증

- 격리 PostgreSQL(PGlite): 실제 migration, 별도 목록 테이블 없음, 판정 결과의 원자적 저장·검증 이메일 일치, 기존 Workspace 유지, 직접 RLS, 서버 전용 심사값, 역할 생성 차단, 최초 signup RPC 재시도와 service-role 생성, 알림 claim 1회, 수동 해제 유지.
- 코드 목록 테스트: 등록된 전체 도메인·하위 도메인·대소문자 처리, 위장 접미사 제외, 검증되지 않은 이메일 거부.
- 변경 경로 테스트: 온보딩 완료 시 Slack 생략, 소유자/내부 계정도 검토 경계 적용, 온보딩 Pitch 도구 범위 제한, 알림 중복·전송 불명확·429 처리.
- 실제 검토 컴포넌트의 한국어·영어 데스크톱/모바일 브라우저 렌더 확인. 코드 목록으로 이동한 뒤 관련 테스트 12개와 격리 DB 검증 통과. 전체 TypeScript 검사는 이번 변경 밖 `src/pages/company.tsx`의 랜딩 문구 타입 오류 때문에 미통과이며, 이번 변경 경로의 타입 오류는 보고되지 않았다.
- 2026-10-21 배포의 프로덕션 빌드와 타입 검사는 통과했다. 운영 DB 정의·권한은 확인했으며, 실제 OAuth·Slack 전송·LLM을 포함하는 전체 가입 E2E는 실행하지 않았다.
