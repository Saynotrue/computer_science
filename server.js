require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
//const { chromium } = require('playwright');
const app = express();
const port = 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 🌟 세션 설정 (서버가 사용자의 로그인 상태를 기억하도록 함)
app.use(session({
    secret: 'kbo-master-secret-key',
    resave: false,
    saveUninitialized: true,
}));

app.use(express.json());
app.use(express.static('public'));

// --- 네이버 로그인 라우터 ---
const NAVER_LOGIN_CLIENT_ID = process.env.NAVER_LOGIN_CLIENT_ID;
const NAVER_LOGIN_CLIENT_SECRET = process.env.NAVER_LOGIN_CLIENT_SECRET;
const REDIRECT_URI = `http://localhost:${port}/api/auth/naver/callback`;

// 1. 네이버 로그인 창으로 보내기
app.get('/api/auth/naver', (req, res) => {
    const state = Math.random().toString(36).substring(3, 14);
    const api_url = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${NAVER_LOGIN_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&state=${state}`;
    res.redirect(api_url);
});

// 2. 네이버에서 인증 후 돌아오는 콜백 처리
app.get('/api/auth/naver/callback', async (req, res) => {
    const { code, state } = req.query;
    const token_url = `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${NAVER_LOGIN_CLIENT_ID}&client_secret=${NAVER_LOGIN_CLIENT_SECRET}&redirect_uri=${REDIRECT_URI}&code=${code}&state=${state}`;

    try {
        // 토큰 발급
        const tokenRes = await fetch(token_url);
        const tokenData = await tokenRes.json();

        // 프로필 정보 조회
        const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const profileData = await profileRes.json();

        if (profileData.resultcode === '00') {
            const user = profileData.response;
            const nickname = user.nickname || user.name || '야구팬';

            // DB에 유저 정보 저장 (이미 있으면 닉네임만 업데이트)
            await supabase.from('users').upsert([{ id: user.id, nickname: nickname }]);

            // 🌟 세션에 로그인 정보 저장 (userId 규칙 적용!)
            req.session.userId = user.id;
            req.session.nickname = nickname;

            res.redirect('/'); // 로그인 완료 후 메인 화면으로 이동
        } else {
            res.status(400).send('프로필 조회 실패');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('로그인 에러');
    }
});

// 3. 현재 로그인 상태 확인 API
app.get('/api/auth/session', async (req, res) => {
    if (req.session.userId) {
        const { data } = await supabase
            .from('users')
            .select('favorite_team')
            .eq('id', req.session.userId)
            .single();

        res.json({
            loggedIn: true,
            nickname: req.session.nickname,
            favoriteTeam: data?.favorite_team || '미지정'
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// 4. 로그아웃 API
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// 네이버 지도 키 전달
app.get('/api/config', (req, res) => {
    res.json({ naverClientId: process.env.NAVER_CLIENT_ID });
});

// --- [직관 기록 관련 API] ---

// 직관 기록 (내 기록만)
app.get('/api/games', async (req, res) => {
    if (!req.session.userId) return res.json({ games: [], stats: { total: 0, wins: 0, winRate: 0 } });

    const { data: games } = await supabase
        .from('games')
        .select('*')
        .eq('user_id', req.session.userId)
        .order('created_at', { ascending: false });

    const total = games.length;
    const wins = games.filter(g => g.result === 'win').length;
    const winRate = total === 0 ? 0 : Math.round((wins / total) * 100);

    res.json({ games, stats: { total, wins, winRate } });
});

app.post('/api/games', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('로그인 필요');
    const { date, stadium, result } = req.body;
    await supabase.from('games').insert([{ user_id: req.session.userId, date, stadium, result }]);
    res.json({ success: true });
});

// 🌟 1. 직관 기록 삭제 API (세션 오류 수정됨)
app.delete('/api/games/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인 필요' });

    try {
        const { error } = await supabase
            .from('games')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', req.session.userId); // req.session.user.id -> req.session.userId로 수정!

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: '기록 삭제 실패' });
    }
});


// --- [팀 설정 및 크롤링 API] ---

app.post('/api/user/team', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('로그인 필요');
    const { team } = req.body;

    const { error } = await supabase
        .from('users')
        .update({ favorite_team: team })
        .eq('id', req.session.userId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.get('/api/kbo/schedule', async (req, res) => {
    const rawDate = req.query.date;
    const [year, month, day] = rawDate.split('-');

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto('https://www.koreabaseball.com/Schedule/Schedule.aspx', { waitUntil: 'networkidle' });
        await page.selectOption('#ddlYear', year);
        await page.selectOption('#ddlMonth', month);
        await page.waitForTimeout(1000);

        const games = await page.evaluate((targetDay) => {
            const gameList = [];
            const rows = document.querySelectorAll('#tblScheduleList > tbody > tr');
            let currentDay = '';

            rows.forEach((row, index) => {
                const dayCell = row.querySelector('.day');
                if (dayCell) {
                    currentDay = dayCell.textContent.split('.')[1].substring(0, 2);
                }

                if (currentDay === targetDay) {
                    const playCell = row.querySelector('.play');

                    if (playCell && !playCell.textContent.includes('경기일정이 없습니다')) {
                        const teams = playCell.textContent.split('vs');
                        const away = teams[0].trim();
                        const home = teams[1].trim();

                        let stadium = '미정';
                        const stadiumNames = ['잠실', '고척', '문학', '수원', '대전', '대구', '광주', '사직', '창원', '포항', '울산'];
                        row.querySelectorAll('td').forEach(td => {
                            stadiumNames.forEach(sName => {
                                if (td.textContent.includes(sName)) stadium = sName;
                            });
                        });

                        gameList.push({
                            id: index,
                            home: home,
                            away: away,
                            stadium: stadium,
                            status: 'BEFORE',
                            homeScore: 0,
                            awayScore: 0
                        });
                    }
                }
            });
            return gameList;
        }, day);

        await browser.close();
        res.json(games);
    } catch (error) {
        if (browser) await browser.close();
        console.error('Playwright 크롤링 에러:', error);
        res.status(500).json({ error: '일정 데이터를 파싱하지 못했습니다.' });
    }
});


// --- [맛집 관련 API] ---

app.get('/api/foods', async (req, res) => {
    const { data: foods } = await supabase.from('foods').select('*').order('id', { ascending: true });

    let stampedIds = [];
    if (req.session.userId) {
        const { data: stamps } = await supabase
            .from('user_stamps')
            .select('food_id')
            .eq('user_id', req.session.userId);
        stampedIds = stamps.map(s => s.food_id);
    }

    const foodsWithStamps = foods.map(f => ({ ...f, stamped: stampedIds.includes(f.id) }));
    res.json(foodsWithStamps);
});

app.post('/api/foods/:id/stamp', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('로그인 필요');
    const foodId = parseInt(req.params.id);

    const { data: existing } = await supabase.from('user_stamps')
        .select('*').eq('user_id', req.session.userId).eq('food_id', foodId).single();

    if (existing) {
        await supabase.from('user_stamps').delete().eq('user_id', req.session.userId).eq('food_id', foodId);
    } else {
        await supabase.from('user_stamps').insert([{ user_id: req.session.userId, food_id: foodId }]);
    }
    res.json({ success: true });
});

// 🌟 나만의 맛집 추가 API (세션 오류 수정됨)
app.post('/api/my-restaurants', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    const { stadium, name } = req.body;
    const userId = req.session.userId;

    try {
        const { error } = await supabase
            .from('my_restaurants')
            .insert([{ user_id: userId, stadium: stadium, name: name }]);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: '맛집 추가에 실패했습니다.' });
    }
});

// 🌟 나만의 맛집 불러오기 API (세션 오류 수정됨)
app.get('/api/my-restaurants', async (req, res) => {
    if (!req.session.userId) return res.json([]);

    const userId = req.session.userId;

    try {
        const { data, error } = await supabase
            .from('my_restaurants')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: '맛집을 불러오지 못했습니다.' });
    }
});

// 🌟 2. 나만의 맛집 삭제 API (세션 오류 수정됨)
app.delete('/api/my-restaurants/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인 필요' });

    try {
        const { error } = await supabase
            .from('my_restaurants')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', req.session.userId);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: '맛집 삭제 실패' });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}
module.exports = app;
