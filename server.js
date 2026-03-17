const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ======== DATA ========
const rooms = {}; // roomCode => { players, chat, game, scores }

const quizQuestions = [
  { q: 'ما عاصمة فرنسا؟', opts: ['برلين', 'باريس', 'روما', 'مدريد'], ans: 1 },
  { q: 'كم عدد أيام السنة؟', opts: ['364', '365', '366', '360'], ans: 1 },
  { q: 'ما أكبر كوكب في المجموعة الشمسية؟', opts: ['زحل', 'المريخ', 'المشتري', 'أورانوس'], ans: 2 },
  { q: 'من كتب روميو وجولييت؟', opts: ['ديكنز', 'شكسبير', 'هوميروس', 'دانتي'], ans: 1 },
  { q: 'ما أطول نهر في العالم؟', opts: ['الأمازون', 'النيل', 'المسيسيبي', 'اليانغتسي'], ans: 1 },
  { q: 'كم عدد ألوان قوس قزح؟', opts: ['5', '6', '7', '8'], ans: 2 },
  { q: 'ما عاصمة اليابان؟', opts: ['أوساكا', 'كيوتو', 'طوكيو', 'ناغويا'], ans: 2 },
  { q: 'من اخترع الهاتف؟', opts: ['إديسون', 'غراهام بيل', 'تسلا', 'فاراداي'], ans: 1 },
  { q: 'ما أصغر دولة في العالم؟', opts: ['موناكو', 'سان مارينو', 'الفاتيكان', 'ليختنشتاين'], ans: 2 },
  { q: 'كم عدد أضلاع المسدس؟', opts: ['5', '6', '7', '8'], ans: 1 },
  { q: 'ما أسرع حيوان بري؟', opts: ['الأسد', 'النمر', 'الفهد', 'الحصان'], ans: 2 },
  { q: 'ما عاصمة البرازيل؟', opts: ['ريو', 'ساو باولو', 'برازيليا', 'سلفادور'], ans: 2 },
];

const describeWords = [
  'تفاح', 'سيارة', 'شمس', 'قمر', 'بحر', 'جبل', 'كتاب', 'قطة', 'كلب', 'طائرة',
  'قلب', 'نجمة', 'زهرة', 'ثلج', 'نار', 'ماء', 'ريح', 'غيمة', 'مطر', 'برق',
];

const dailyChallenges = [
  'أرسل لحبيبتك صورة شيء يذكرك فيها اليوم',
  'قل لحبيبتك 3 أشياء تحبها فيها',
  'اختر أغنية تعبر عن مشاعرك الآن وشاركها',
  'تحدى حبيبتك: من يحل أكثر أسئلة في دقيقتين؟',
  'اكتب لحبيبتك رسالة صغيرة من 3 كلمات فقط',
];

// ======== HELPERS ========
function createRoom(code) {
  rooms[code] = {
    code,
    players: [],
    chat: [],
    scores: {},
    game: null,
    puzzle: null,
    daily: {
      challenge: dailyChallenges[Math.floor(Math.random() * dailyChallenges.length)],
      question: quizQuestions[Math.floor(Math.random() * quizQuestions.length)],
    },
  };
  return rooms[code];
}

function getRoom(code) { return rooms[code]; }

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

function generatePuzzle() {
  const emojis = ['🌸','🌙','⭐','❤️','🎯','🎵','🌈','🦋','🌺','🎪','🦄','🌊'];
  const picked = shuffle(emojis).slice(0, 6);
  const pieces = shuffle([...picked.map((e, i) => ({ id: i, emoji: e, correct: i }))]);
  return { pieces, solution: picked, solved: false };
}

// ======== SOCKET ========
io.on('connection', (socket) => {

  // --- CREATE ROOM ---
  socket.on('create_room', ({ name }) => {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    const room = createRoom(code);
    const player = { id: socket.id, name, score: 0, ready: false };
    room.players.push(player);
    room.scores[socket.id] = 0;
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.name = name;
    socket.emit('room_created', { code, player, room });
  });

  // --- JOIN ROOM ---
  socket.on('join_room', ({ code, name }) => {
    const room = getRoom(code.toUpperCase());
    if (!room) { socket.emit('error', { msg: 'الغرفة غير موجودة' }); return; }
    if (room.players.length >= 2) { socket.emit('error', { msg: 'الغرفة ممتلئة' }); return; }
    const player = { id: socket.id, name, score: 0, ready: false };
    room.players.push(player);
    room.scores[socket.id] = 0;
    socket.join(code.toUpperCase());
    socket.data.roomCode = code.toUpperCase();
    socket.data.name = name;
    socket.emit('room_joined', { room, player });
    io.to(code.toUpperCase()).emit('partner_joined', { name, players: room.players });
  });

  // --- CHAT ---
  socket.on('send_message', ({ msg }) => {
    const code = socket.data.roomCode;
    if (!code || !msg.trim()) return;
    const message = { id: uuidv4(), from: socket.data.name, text: msg.trim(), time: Date.now() };
    rooms[code]?.chat.push(message);
    io.to(code).emit('new_message', message);
  });

  // --- START QUIZ ---
  socket.on('start_quiz', () => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room) return;
    const questions = shuffle(quizQuestions).slice(0, 8);
    room.game = { type: 'quiz', questions, current: 0, answers: {}, scores: {}, active: true };
    room.scores = {};
    room.players.forEach(p => { room.scores[p.id] = 0; });
    io.to(code).emit('quiz_started', { question: questions[0], index: 0, total: questions.length });
  });

  // --- QUIZ ANSWER ---
  socket.on('quiz_answer', ({ answerIndex }) => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room?.game || room.game.type !== 'quiz' || !room.game.active) return;
    const { questions, current, answers } = room.game;
    if (answers[socket.id] !== undefined) return;
    answers[socket.id] = answerIndex;
    const q = questions[current];
    const correct = answerIndex === q.ans;
    if (correct) room.scores[socket.id] = (room.scores[socket.id] || 0) + 10;
    socket.emit('quiz_answer_result', { correct, correctAnswer: q.ans, score: room.scores[socket.id] });
    if (Object.keys(answers).length >= room.players.length) {
      setTimeout(() => {
        room.game.current++;
        room.game.answers = {};
        if (room.game.current >= questions.length) {
          room.game.active = false;
          io.to(code).emit('quiz_ended', { scores: room.scores, players: room.players });
        } else {
          io.to(code).emit('quiz_next', {
            question: questions[room.game.current],
            index: room.game.current,
            total: questions.length,
            scores: room.scores,
          });
        }
      }, 1200);
    }
  });

  // --- START DESCRIBE ---
  socket.on('start_describe', () => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room) return;
    const word = shuffle(describeWords)[0];
    const describerIdx = Math.floor(Math.random() * room.players.length);
    const describer = room.players[describerIdx];
    room.game = { type: 'describe', word, describer: describer.id, round: 1, active: true, timer: 60 };
    room.players.forEach(p => {
      if (p.id === describer.id) {
        io.to(p.id).emit('describe_started', { role: 'describer', word, describer: describer.name });
      } else {
        io.to(p.id).emit('describe_started', { role: 'guesser', describer: describer.name });
      }
    });
  });

  // --- DESCRIBE GUESS ---
  socket.on('describe_guess', ({ guess }) => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room?.game || room.game.type !== 'describe') return;
    if (guess.trim().toLowerCase() === room.game.word.toLowerCase()) {
      room.scores[socket.id] = (room.scores[socket.id] || 0) + 15;
      room.scores[room.game.describer] = (room.scores[room.game.describer] || 0) + 10;
      io.to(code).emit('describe_correct', {
        guesser: socket.data.name,
        word: room.game.word,
        scores: room.scores,
      });
    } else {
      socket.emit('describe_wrong', { guess });
    }
  });

  // --- START PUZZLE ---
  socket.on('start_puzzle', () => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room) return;
    const puzzle = generatePuzzle();
    room.puzzle = puzzle;
    room.game = { type: 'puzzle', active: true };
    io.to(code).emit('puzzle_started', { pieces: puzzle.pieces });
  });

  // --- PUZZLE MOVE ---
  socket.on('puzzle_move', ({ pieceId, position }) => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room?.puzzle) return;
    io.to(code).emit('puzzle_piece_moved', { pieceId, position, by: socket.data.name });
  });

  // --- PUZZLE SOLVE ---
  socket.on('puzzle_solve', ({ order }) => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room?.puzzle) return;
    const correct = order.every((id, i) => id === i);
    if (correct) {
      room.puzzle.solved = true;
      room.players.forEach(p => { room.scores[p.id] = (room.scores[p.id] || 0) + 20; });
      io.to(code).emit('puzzle_solved', { scores: room.scores, players: room.players });
    } else {
      socket.emit('puzzle_wrong');
    }
  });

  // --- GET DAILY ---
  socket.on('get_daily', () => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room) return;
    socket.emit('daily_data', room.daily);
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code || !rooms[code]) return;
    rooms[code].players = rooms[code].players.filter(p => p.id !== socket.id);
    io.to(code).emit('partner_left', { name: socket.data.name });
    if (rooms[code].players.length === 0) delete rooms[code];
  });
});

// ======== START ========
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
