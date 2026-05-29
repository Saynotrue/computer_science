// 🌟 네이버 지도 API 인증 실패 시 화면에 알림을 띄우는 함수 (문서 권장 사항)
window.navermap_authFailure = function () {
    alert("네이버 지도 API 인증에 실패했습니다.\nClient ID가 정확한지, NCP 콘솔의 'Web 서비스 URL'에 현재 주소가 등록되어 있는지 확인해 주세요.");
};

let foodsData = [];
let map = null; // 초기에는 지도를 렌더링하지 않음
let markers = [];

// 🌟 네이버 API 스크립트 로드 완료 시 호출되는 콜백 함수
window.initMap = function () {
    checkLoginState();

    // 맛집 탭이 켜져 있을 때만 지도를 그림
    if (document.getElementById('foodStamp').classList.contains('active')) {
        createMapInstance();
    }
};

// --- 탭 전환 로직 ---
function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));

    // 클릭한 탭 UI 활성화 처리
    if (tabId === 'winRate') {
        document.querySelectorAll('.tab')[0].classList.add('active');
    } else {
        document.querySelectorAll('.tab')[1].classList.add('active');
    }

    document.getElementById(tabId).classList.add('active');

    // ✅ 지도가 화면에 나타날 때 렌더링 처리
    if (tabId === 'foodStamp') {
        if (!map) {
            createMapInstance();
            renderFoods();
        } else {
            window.dispatchEvent(new Event('resize'));
            const filter = document.getElementById('stadiumSelect').value;
            const filtered = filter === '전체' ? foodsData : foodsData.filter(f => f.stadium === filter);
            updateMapMarkers(filtered);
        }
    }
}

// --- 지도 초기화 로직 ---
function createMapInstance() {
    if (typeof naver === 'undefined' || map) return;

    const container = document.getElementById('map');
    const options = {
        center: new naver.maps.LatLng(36.8, 127.5),
        zoom: 7
    };

    map = new naver.maps.Map(container, options);
}

// --- 마커 업데이트 로직 ---
function updateMapMarkers(filteredFoods) {
    if (!map) return;

    markers.forEach(m => m.setMap(null));
    markers = [];

    const uniqueLocations = [];
    filteredFoods.forEach(f => {
        const isDuplicate = uniqueLocations.some(loc => loc.stadium === f.stadium);
        if (!isDuplicate && f.lat && f.lng) {
            uniqueLocations.push({ stadium: f.stadium, lat: f.lat, lng: f.lng });
        }
    });

    uniqueLocations.forEach(loc => {
        const latNum = parseFloat(loc.lat);
        const lngNum = parseFloat(loc.lng);

        const marker = new naver.maps.Marker({
            position: new naver.maps.LatLng(latNum, lngNum),
            map: map,
            title: loc.stadium
        });
        markers.push(marker);
    });

    if (uniqueLocations.length === 1) {
        map.morph(new naver.maps.LatLng(parseFloat(uniqueLocations[0].lat), parseFloat(uniqueLocations[0].lng)), 15);
    } else if (uniqueLocations.length > 1) {
        map.morph(new naver.maps.LatLng(36.8, 127.5), 7);
    }
}

// --- 새 창에서 네이버 지도 열기 ---
function openNaverMapWindow(stadium, name) {
    const query = encodeURIComponent(`${stadium} ${name}`);
    const url = `https://map.naver.com/v5/search/${query}`;
    window.open(url, '_blank');
}

// --- 탭 1: 직관 기록 가져오기 ---
async function fetchGames() {
    const res = await fetch('/api/games');
    const data = await res.json();
    const games = data.games;

    // 승률 및 취소율 계산
    const total = games.length;
    const cancels = games.filter(g => g.result === 'cancel').length;
    const validGames = games.filter(g => g.result !== 'cancel');
    const validTotal = validGames.length;
    const wins = validGames.filter(g => g.result === 'win').length;

    const actualWinRate = validTotal === 0 ? 0 : Math.round((wins / validTotal) * 100);
    const cancelRate = total === 0 ? 0 : Math.round((cancels / total) * 100);

    setTimeout(() => {
        document.getElementById('winProgressBar').style.width = actualWinRate + '%';
        document.getElementById('winRateScore').innerText = actualWinRate + '%';

        let title = "집관러";
        if (total > 0) {
            if (cancelRate >= 25) {
                title = "우취요정";
            } else if (actualWinRate >= 60) {
                title = "승요";
            } else if (actualWinRate >= 40) {
                title = "평범한 직관러";
            } else {
                title = "패요";
            }
        }
        document.getElementById('fairyTitle').innerText = title;
    }, 100);

    // 🌟 리스트 렌더링 (중복 코드 제거 & bin.png 휴지통 적용)
    document.getElementById('gameList').innerHTML = games.map(g => {
        let resultText = '';
        let tagClass = '';

        if (g.result === 'win') { resultText = '승리'; tagClass = 'win-tag'; }
        else if (g.result === 'lose') { resultText = '패배'; tagClass = 'lose-tag'; }
        else if (g.result === 'draw') { resultText = '무승부'; tagClass = 'draw-tag'; }
        else if (g.result === 'cancel') { resultText = '취소'; tagClass = 'cancel-tag'; }

        return `
        <div class="list-item">
            <span>${g.date} (${g.stadium})</span>
            <span class="delete-hover-zone" onclick="deleteGame(${g.id})">
                <span class="original-content ${tagClass}">${resultText}</span>
                <img src="./bin.png" class="trash-icon" alt="삭제">
            </span>
        </div>
        `;
    }).join('');
}

// 🌟 직관 기록 삭제 함수
async function deleteGame(id) {
    if (!confirm('이 직관 기록을 정말 삭제하시겠습니까?')) return;

    await fetch(`/api/games/${id}`, { method: 'DELETE' });
    fetchGames(); // 승률 재계산을 위해 다시 불러오기
}

// --- 일정 크롤링 ---
document.getElementById('gDate').addEventListener('change', async (e) => {
    const date = e.target.value;
    const matchSelect = document.getElementById('gMatch');

    matchSelect.innerHTML = '<option value="">불러오는 중...</option>';

    try {
        const res = await fetch(`/api/kbo/schedule?date=${date}`);
        const games = await res.json();

        if (games.length === 0) {
            matchSelect.innerHTML = '<option value="">해당 날짜에 경기가 없습니다.</option>';
            return;
        }

        matchSelect.innerHTML = games.map(g => {
            if (g.status === 'CANCEL') {
                return `<option disabled>우천취소: ${g.away} vs ${g.home}</option>`;
            }

            let matchText = `${g.away} vs ${g.home}`;
            if (g.status === 'RESULT') {
                matchText = `${g.away} ${g.awayScore} : ${g.homeScore} ${g.home} [종료]`;
            }

            return `<option value="${g.stadium}">${matchText} (${g.stadium})</option>`;
        }).join('');

    } catch (error) {
        matchSelect.innerHTML = '<option value="">일정을 불러오는데 실패했습니다.</option>';
    }
});

// --- 경기 폼 제출 ---
document.getElementById('gameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
        date: document.getElementById('gDate').value,
        stadium: document.getElementById('gMatch').value,
        result: document.getElementById('gResult').value
    };
    await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    fetchGames();
});

// --- 탭 2: 맛집 데이터 가져오기 (수정됨: 두 데이터 합치기) ---
async function fetchFoods() {
    try {
        // 1. 서버에 저장된 '기본 맛집' 데이터 가져오기
        const res1 = await fetch('/api/foods');
        const defaultFoods = await res1.json();

        // 2. 내가 방금 추가한 '나만의 맛집' 데이터 가져오기
        let myFoods = [];
        const res2 = await fetch('/api/my-restaurants');
        if (res2.ok) {
            myFoods = await res2.json();
        }

        // 🌟 3. 두 데이터를 하나로 합치기!
        foodsData = [...defaultFoods, ...myFoods];

        // 합쳐진 데이터를 바탕으로 화면에 리스트 다시 그리기
        renderFoods();
    } catch (error) {
        console.error('맛집 데이터를 불러오는 중 오류 발생:', error);
    }
}

// --- 맛집 리스트 렌더링 (수정됨: 내 맛집 완벽 분리) ---
function renderFoods() {
    const filter = document.getElementById('stadiumSelect').value;
    const filtered = filter === '전체' ? foodsData : foodsData.filter(f => f.stadium === filter);

    const list = document.getElementById('foodList');
    list.innerHTML = '';

    filtered.forEach(food => {
        const div = document.createElement('div');

        // 🌟 핵심: user_id가 있으면 '내가 추가한 맛집'으로 판단
        const isMyFood = food.user_id ? true : false;

        // 내 맛집은 항상 도장이 찍힌 상태(stamped)로 예쁘게 표시해 줍니다.
        div.className = `food-item ${food.stamped || isMyFood ? 'stamped' : ''}`;

        if (isMyFood) {
            // 내가 추가한 맛집 (휴지통 버튼 활성화 + 이름 옆에 (MY) 태그 달아주기)
            div.innerHTML = `
                <div>
                    <div style="font-size: 12px; color: var(--kbo-silver);">${food.stadium}</div>
                    <div style="font-weight: 500; margin-top: 5px;">${food.name} <span style="font-size:10px; color:#c92a2a;">(MY)</span></div>
                </div>
                <div class="delete-hover-zone" onclick="deleteFood(${food.id}, event)">
                    <span class="original-content stamp">✅</span>
                    <img src="./bin.png" class="trash-icon" alt="삭제">
                </div>
            `;
        } else {
            // 기본 맛집 (휴지통 버튼 없음)
            div.innerHTML = `
                <div>
                    <div style="font-size: 12px; color: var(--kbo-silver);">${food.stadium}</div>
                    <div style="font-weight: 500; margin-top: 5px;">${food.name}</div>
                </div>
                <div class="stamp">✅</div>
            `;
        }

        let clickTimer = null;

        const handleInteraction = (e) => {
            if (clickTimer === null) {
                clickTimer = setTimeout(() => {
                    clickTimer = null;
                    // 한 번 클릭: 지도 열기
                    openNaverMapWindow(food.stadium, food.name);
                }, 300);
            } else {
                clearTimeout(clickTimer);
                clickTimer = null;

                // 더블 클릭: 스탬프 찍기 (단, 내가 추가한 맛집은 기본 도장이므로 스탬프 요청 제외)
                if (!isMyFood) {
                    toggleStamp(food.id);
                }
            }
            e.preventDefault();
        };

        div.addEventListener('click', handleInteraction);
        list.appendChild(div);
    });

    if (map) {
        updateMapMarkers(filtered);
    }
}

// 🌟 맛집 기록 삭제 함수 (지도 열림 방지 포함)
async function deleteFood(id, event) {
    event.stopPropagation(); // 버튼 클릭 시 부모(지도 열기)로 이벤트가 전파되는 것을 차단
    if (!confirm('이 맛집 기록을 정말 삭제하시겠습니까?')) return;

    // (api 주소는 서버 설정에 맞게 변경하세요. 예: /api/foods/${id} 또는 /api/my-restaurants/${id})
    await fetch(`/api/my-restaurants/${id}`, { method: 'DELETE' });
    fetchFoods();
}

async function toggleStamp(id) {
    const res = await fetch('/api/auth/session');
    const authData = await res.json();

    if (!authData.loggedIn) {
        alert("로그인이 필요한 기능입니다.");
        return;
    }

    await fetch(`/api/foods/${id}/stamp`, { method: 'POST' });
    fetchFoods();
}

// --- 로그인 상태 확인 ---
async function checkLoginState() {
    const res = await fetch('/api/auth/session');
    const data = await res.json();
    const authArea = document.getElementById('authArea');

    const teamColors = {
        'LG': '#C30452',
        'KT': '#000000',
        'SSG': '#CE0E2D',
        'NC': '#315288',
        '두산': '#1A1748',
        'KIA': '#EA0029',
        '롯데': '#041E42',
        '삼성': '#074CA1',
        '한화': '#FC4E00',
        '키움': '#570514',
        '미지정': '#03C75A'
    };

    if (data.loggedIn) {
        const badgeColor = teamColors[data.favoriteTeam] || '#03C75A';
        const teamBadge = data.favoriteTeam !== '미지정' ? `<span style="color: ${badgeColor};">[${data.favoriteTeam}팬]</span>` : '';

        authArea.innerHTML = `
            <span onclick="openSettings('${data.favoriteTeam}')" style="font-weight: 300; margin-right: 15px; cursor: pointer; text-decoration: none;">
                👤 ${teamBadge} ${data.nickname}님 환영합니다!
            </span>
            <button onclick="logout()" style="background: var(--kbo-red); color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer;">로그아웃</button>
        `;
        fetchGames();
        fetchFoods();
    } else {
        authArea.innerHTML = `
            <button onclick="location.href='/api/auth/naver'" style="background:#03C75A; color:white; border:none; padding:10px 15px; border-radius:5px; font-weight:bold; cursor:pointer;">
                N 네이버 로그인
            </button>
        `;
        document.getElementById('gameList').innerHTML = '<div style="padding: 20px; text-align: center;">로그인이 필요합니다.</div>';
        document.getElementById('foodList').innerHTML = '<div style="padding: 20px; text-align: center;">로그인이 필요합니다.</div>';
    }
}

// --- 나만의 맛집 추가 함수 ---
async function addMyFood() {
    const stadium = document.getElementById('newFoodStadium').value;
    const name = document.getElementById('newFoodName').value;

    if (!name.trim()) {
        alert('맛집 이름을 입력해주세요!');
        return;
    }

    try {
        const res = await fetch('/api/my-restaurants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stadium, name })
        });

        if (res.ok) {
            document.getElementById('newFoodName').value = '';
            fetchFoods(); // 🌟 오류 수정: fetchFoodList() 대신 올바른 함수 호출
        } else {
            alert('맛집 추가에 실패했습니다. 로그인 상태를 확인하세요.');
        }
    } catch (error) {
        console.error(error);
    }
}

// --- 사용자 설정(응원팀) 모달 제어 ---
function openSettings(currentTeam) {
    document.getElementById('settingsModal').style.display = 'flex';
    document.getElementById('teamSelect').value = currentTeam;
}

function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
}

async function saveTeam() {
    const selectedTeam = document.getElementById('teamSelect').value;

    const res = await fetch('/api/user/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: selectedTeam })
    });

    if (res.ok) {
        alert('응원팀이 성공적으로 저장되었습니다!');
        closeSettings();
        checkLoginState();
    } else {
        alert('저장에 실패했습니다.');
    }
}

async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.reload();
}

// --- 앱 초기화 실행 ---
window.onload = () => {
    checkLoginState();
};