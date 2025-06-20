const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

dotenv.config();
const app = express();

// Инициализация Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Пароль для доступа к главной странице
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'securepassword123';

const basicAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Restricted Area"');
        return res.status(401).send('Authentication required');
    }
    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const username = auth[0];
    const password = auth[1];
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        return next();
    } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Restricted Area"');
        return res.status(401).send('Authentication required');
    }
};

const initQRs = async () => {
    const { data: existingQRs, error } = await supabase
        .from('qrcodes')
        .select('qr_id');
    if (error) {
        console.error('Ошибка проверки QR-кодов:', error);
        return;
    }
    if (existingQRs.length === 0) {
        const qrData = Array.from({ length: 5 }, () => ({ qr_id: uuidv4() }));
        const { error: insertError } = await supabase
            .from('qrcodes')
            .insert(qrData);
        if (insertError) {
            console.error('Ошибка инициализации QR-кодов:', insertError);
        } else {
            console.log('QR-коды инициализированы');
        }
    }
};
initQRs();

app.get('/', basicAuth, async (req, res) => {
    const { data: qrCodes, error } = await supabase
        .from('qrcodes')
        .select('qr_id');
    if (error) {
        return res.status(500).send('Ошибка загрузки QR-кодов');
    }
    res.render('index', { qrCodes });
});

app.get('/generate-qr/:id', basicAuth, async (req, res) => {
    const qrId = req.params.id;
    const url = `http://localhost:${process.env.PORT}/claim/${qrId}`;
    try {
        const qrImage = await QRCode.toString(url, {
            type: 'svg',
            width: 300,
            margin: 2
        });
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>QR Code ${qrId.slice(0, 8)}</title>
                <link rel="stylesheet" href="/style.css">
            </head>
            <body>
                <header>
                    <img src="/lenovo-logo.svg" alt="Lenovo Logo" class="logo">
                </header>
                <div class="container">
                    <div class="qr-container">${qrImage}</div>
                    <p>QR Code ${qrId.slice(0, 8)}...</p>
                    <a href="/" class="back-btn">Назад</a>
                </div>
                <script>
                    function createParticles() {
                        const particleCount = 50;
                        for (let i = 0; i < particleCount; i++) {
                            const particle = document.createElement('div');
                            particle.className = 'particle';
                            particle.style.left = Math.random() * 100 + 'vw';
                            particle.style.width = Math.random() * 5 + 2 + 'px';
                            particle.style.height = particle.style.width;
                            particle.style.animationDuration = Math.random() * 10 + 10 + 's';
                            particle.style.animationDelay = Math.random() * 5 + 's';
                            document.body.appendChild(particle);
                        }
                    }
                    window.onload = createParticles;
                </script>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send('Ошибка генерации QR-кода');
    }
});

app.get('/claim/:qrId', async (req, res) => {
    const qrId = req.params.qrId;
    try {
        const { data: qr, error } = await supabase
            .from('qrcodes')
            .select('*')
            .eq('qr_id', qrId)
            .single();
        if (error || !qr) {
            return res.render('error', { message: 'Недействительный QR-код' });
        }
        if (qr.used) {
            return res.render('error', {
                message: 'Этот приз уже был получен!',
                winner: qr.winner_name || null
            });
        }
        res.render('claim', { qrId });
    } catch (err) {
        res.status(500).send('Ошибка сервера');
    }
});

app.post('/claim/:qrId', async (req, res) => {
    const qrId = req.params.qrId;
    const { name } = req.body;
    try {
        const { data: qr, error } = await supabase
            .from('qrcodes')
            .select('*')
            .eq('qr_id', qrId)
            .single();
        if (error || !qr) {
            return res.render('error', { message: 'Недействительный QR-код' });
        }
        if (qr.used) {
            return res.render('error', {
                message: 'Этот приз уже был получен!',
                winner: qr.winner_name || null
            });
        }
        const { error: updateError } = await supabase
            .from('qrcodes')
            .update({
                used: true,
                winner_name: name,
                used_at: new Date().toISOString()
            })
            .eq('qr_id', qrId);
        if (updateError) {
            return res.status(500).send('Ошибка обновления данных');
        }
        res.render('success', { name });
    } catch (err) {
        res.status(500).send('Ошибка сервера');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});