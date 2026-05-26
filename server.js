const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. 승리요정(직관 승률) 더미 데이터
let games = [
    { id: 1, date: '2026-04-10', stadium: '잠실', result: 'win' },
    { id: 2, date: '2026-04-15', stadium: '수원', result: 'lose' },
    { id: 3, date: '2026-05-01', stadium: '대전', result: 'win' }
];

// 2. 구장 맛집 더미 데이터
let foods = [
    { id: 1, stadium: '잠실', name: '파오파오 만두', stamped: true },
    { id: 2, stadium: '잠실', name: '잠실원샷', stamped: false },
    { id: 3, stadium: '잠실', name: '백미당 아이스크림', stamped: false },
    { id: 4, stadium: '수원', name: '진미통닭', stamped: true },
    { id: 5, stadium: '수원', name: '보영만두', stamped: false },
    { id: 6, stadium: '대전', name: '농심가락 가락국수', stamped: false }
];

// --- [API] 직관 승률 ---
app.get('/api/games', (req, res) => {
    const wins = games.filter(g => g.result === 'win').length;
    const total = games.length;
    const winRate = total === 0 ? 0 : Math.round((wins / total) * 100);
    res.json({ games, stats: { wins, total, winRate } });
});

app.post('/api/games', (req, res) => {
    const { date, stadium, result } = req.body;
    const newGame = { id: Date.now(), date, stadium, result };
    games.push(newGame);
    res.status(201).json(newGame);
});

// --- [API] 구장 맛집 ---
app.get('/api/foods', (req, res) => {
    res.json(foods);
});

app.post('/api/foods/:id/stamp', (req, res) => {
    const id = parseInt(req.params.id);
    const food = foods.find(f => f.id === id);
    if (food) {
        food.stamped = !food.stamped; // 도장 찍기/취소 토글
        res.json(food);
    } else {
        res.status(404).json({ message: '메뉴를 찾을 수 없습니다.' });
    }
});

// 서버 실행
app.listen(PORT, () => {
    console.log(`🚀 KBO 직관 마스터 서버 구동: http://localhost:${PORT}`);
});