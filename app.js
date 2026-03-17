// ===== STATE =====
const state = {
  name: '',
  roomCode: '',
  myId: null,
  partnerName: '',
  scores: {},
  chatUnread: 0,
  activeTab: 'games',
  puzzle: { pieces: [], selected: [], slotOrder: [] },
};

const socket = io();

// ===== HELPERS =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showArea(id) {
  document.querySelectorAll('.game-area, .game-menu').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function showSubSection(areaId, sectionId) {
  const area = document.getElementById(areaId);
  area.querySelectorAll('[class*="-waiting"],[class*="-active"],[class*="-end"],[class*="-solved"],[class*="-result"]').forEach(el => el.classList.add('hidden'));
  document.getElementById(sectionId).classList.remove('hidden');
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('content-' + tab).classList.add('active');
  state.activeTab = tab;
  if (tab === 'chat') {
    state.chatUnread = 0;
    document.getElementById('chat-badge').classList.add('hidden');
  }
  if (tab === 'daily') socket.emit('get_daily');
}

function getTime() {
  const d = new Date();
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
}

function addSystemMsg(text) {
  const div = document.createElement('div');
  div.className = 'chat-system';
  div.textContent = text;
  document.getElementById('chat-messages').appendChild(div);
  scrollChat();
}

function scrollChat() {
  const c = document.getElementById('chat-messages');
  c.scrollTop = c.scrollHeight;
}

function updateScores() {
  const me = state.scores[state.myId] || 0;
  let partnerScore = 0;
  Object.keys(state.scores).forEach(id => {
    if (id !== state.myId) partnerScore = state.scores[id];
  });
  document.getElementById('score-me').textContent = me;
  document.getElementById('score-partner').textContent = partnerScore;
}

// ===== INTRO =====
function goToLobby() {
  const name = document.getElementById('player-name').value.trim();
  if (!name) { alert('اكتب اسمك أولاً'); return; }
  state.name = name;
  document.getElementById('lobby-name-badge').textContent = '👤 ' + name;
  showScreen('screen-lobby');
}

document.getElementById('player-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') goToLobby();
});

// ===== LOBBY =====
function createRoom() {
  if (!state.name) return;
  socket.emit('create_room', { name: state.name });
}

function joinRoom() {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!code || code.length < 4) { alert('أدخل كود الغرفة'); return; }
  socket.emit('join_room', { code, name: state.name });
}

// ===== WAITING =====
function copyCode() {
  navigator.clipboard.writeText(state.roomCode).then(() => {
    document.querySelector('.btn-copy').textContent = 'تم النسخ ✓';
    setTimeout(() => document.querySelector('.btn-copy').textContent = 'نسخ الكود 📋', 2000);
  });
}

// ===== GAME NAV =====
function startGame(type) {
  showArea('area-' + type);
  if (type === 'quiz') showSubSection('area-quiz', 'quiz-waiting');
  if (type === 'describe') showSubSection('area-describe', 'describe-waiting');
  if (type === 'puzzle') showSubSection('area-puzzle', 'puzzle-waiting');
}

function backToMenu() {
  showArea('game-menu');
}

// ===== QUIZ =====
function renderQuizQuestion(data) {
  showSubSection('area-quiz', 'quiz-active');
  document.getElementById('quiz-index').textContent = data.index + 1;
  document.getElementById('quiz-total').textContent = data.total;
  document.getElementById('quiz-question').textContent = data.question.q;
  document.getElementById('quiz-answered').classList.add('hidden');

  const opts = document.getElementById('quiz-options');
  opts.innerHTML = '';
  data.question.opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-opt';
    btn.textContent = opt;
    btn.onclick = () => {
      socket.emit('quiz_answer', { answerIndex: i });
      document.querySelectorAll('.quiz-opt').forEach(b => b.classList.add('disabled'));
    };
    opts.appendChild(btn);
  });
}

// ===== PUZZLE =====
function renderPuzzle(pieces) {
  showSubSection('area-puzzle', 'puzzle-active');
  state.puzzle.pieces = pieces;
  state.puzzle.selected = [];
  state.puzzle.slotOrder = [];

  const grid = document.getElementById('puzzle-grid');
  const slots = document.getElementById('puzzle-slots');
  grid.innerHTML = '';
  slots.innerHTML = '';
  document.getElementById('puzzle-feedback').textContent = '';

  pieces.forEach(p => {
    const el = document.createElement('div');
    el.className = 'puzzle-piece';
    el.dataset.id = p.id;
    el.textContent = p.emoji;
    el.onclick = () => selectPiece(p.id, el);
    grid.appendChild(el);
  });

  for (let i = 0; i < pieces.length; i++) {
    const slot = document.createElement('div');
    slot.className = 'puzzle-slot';
    slot.dataset.slot = i;
    slots.appendChild(slot);
  }
}

function selectPiece(id, el) {
  if (state.puzzle.slotOrder.includes(id)) return;
  el.classList.toggle('selected');
  if (el.classList.contains('selected')) {
    state.puzzle.selected.push(id);
    const slotIdx = state.puzzle.slotOrder.length;
    const slot = document.querySelector(`.puzzle-slot[data-slot="${slotIdx}"]`);
    if (slot) {
      slot.textContent = el.textContent;
      slot.classList.add('filled');
      state.puzzle.slotOrder.push(id);
    }
  }
  socket.emit('puzzle_move', { pieceId: id, position: state.puzzle.slotOrder.length });
}

function submitPuzzle() {
  if (state.puzzle.slotOrder.length < state.puzzle.pieces.length) {
    document.getElementById('puzzle-feedback').textContent = 'رتب كل القطع أولاً!';
    return;
  }
  socket.emit('puzzle_solve', { order: state.puzzle.slotOrder });
}

// ===== DESCRIBE =====
function sendGuess() {
  const input = document.getElementById('guess-input');
  const guess = input.value.trim();
  if (!guess) return;
  socket.emit('describe_guess', { guess });
  input.value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  const gi = document.getElementById('guess-input');
  if (gi) gi.addEventListener('keydown', e => { if (e.key === 'Enter') sendGuess(); });
});

// ===== CHAT =====
function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('send_message', { msg });
  input.value = '';
}

function addChatMsg(message, isMe) {
  const wrap = document.createElement('div');
  wrap.className = 'chat-msg ' + (isMe ? 'me' : 'them');
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = message.text;
  const meta = document.createElement('div');
  meta.className = 'chat-meta';
  const t = new Date(message.time);
  meta.textContent = (isMe ? '' : message.from + ' · ') + t.getHours() + ':' + String(t.getMinutes()).padStart(2, '0');
  wrap.appendChild(bubble);
  wrap.appendChild(meta);
  document.getElementById('chat-messages').appendChild(wrap);
  scrollChat();
}

// ===== DAILY =====
function sendMood(emoji) {
  socket.emit('send_message', { msg: 'مزاجي الحين: ' + emoji });
  document.getElementById('mood-sent').classList.remove('hidden');
}

// ===== SOCKET EVENTS =====

socket.on('room_created', ({ code, room }) => {
  state.roomCode = code;
  state.myId = socket.id;
  document.getElementById('room-code-display').textContent = code;
  document.getElementById('chip-me').textContent = '💜 ' + state.name;
  showScreen('screen-waiting');
});

socket.on('room_joined', ({ room, player }) => {
  state.myId = socket.id;
  state.roomCode = room.code;
  const partner = room.players.find(p => p.id !== socket.id);
  state.partnerName = partner?.name || '?';
  document.getElementById('chip-me').textContent = '💜 ' + state.name;
  document.getElementById('chip-partner').textContent = '🩷 ' + state.partnerName;
  document.getElementById('score-me').textContent = '0';
  document.getElementById('score-partner').textContent = '0';
  addSystemMsg('انضممت للغرفة مع ' + state.partnerName + ' 💜');
  showScreen('screen-game');
});

socket.on('partner_joined', ({ name, players }) => {
  state.partnerName = name;
  document.getElementById('chip-partner').textContent = '🩷 ' + name;
  addSystemMsg(name + ' انضم/انضمت! 🎉');
  showScreen('screen-game');
  document.getElementById('chip-me').textContent = '💜 ' + state.name;
});

socket.on('partner_left', ({ name }) => {
  addSystemMsg(name + ' غادر/غادرت الغرفة 💔');
});

socket.on('error', ({ msg }) => {
  alert(msg);
});

socket.on('new_message', (message) => {
  const isMe = message.from === state.name;
  addChatMsg(message, isMe);
  if (!isMe && state.activeTab !== 'chat') {
    state.chatUnread++;
    const badge = document.getElementById('chat-badge');
    badge.textContent = state.chatUnread;
    badge.classList.remove('hidden');
  }
});

// QUIZ EVENTS
socket.on('quiz_started', (data) => {
  document.getElementById('quiz-my-score').textContent = '0';
  renderQuizQuestion(data);
});

socket.on('quiz_answer_result', ({ correct, correctAnswer, score }) => {
  document.getElementById('quiz-my-score').textContent = score;
  document.getElementById('answered-icon').textContent = correct ? '✅' : '❌';
  document.getElementById('answered-text').textContent = correct ? 'إجابة صحيحة! +10' : 'إجابة خاطئة';
  document.getElementById('quiz-answered').classList.remove('hidden');

  const opts = document.querySelectorAll('.quiz-opt');
  opts.forEach((btn, i) => {
    if (i === correctAnswer) btn.classList.add('correct');
  });
});

socket.on('quiz_next', ({ question, index, total, scores }) => {
  state.scores = scores;
  updateScores();
  renderQuizQuestion({ question, index, total });
});

socket.on('quiz_ended', ({ scores, players }) => {
  state.scores = scores;
  updateScores();
  showSubSection('area-quiz', 'quiz-end');
  const myScore = scores[state.myId] || 0;
  let partnerScore = 0, partnerName = state.partnerName;
  Object.keys(scores).forEach(id => { if (id !== state.myId) partnerScore = scores[id]; });
  let title = myScore > partnerScore ? '🏆 انت الفائز!' : myScore < partnerScore ? '💜 ' + partnerName + ' فاز!' : '🤝 تعادل!';
  document.getElementById('end-title').textContent = title;
  const es = document.getElementById('end-scores');
  es.innerHTML = `
    <div class="end-score-row"><span>💜 ${state.name}</span><span class="pts">${myScore}</span></div>
    <div class="end-score-row"><span>🩷 ${partnerName}</span><span class="pts">${partnerScore}</span></div>
  `;
});

// DESCRIBE EVENTS
socket.on('describe_started', ({ role, word, describer }) => {
  showSubSection('area-describe', 'describe-active');
  const badge = document.getElementById('describe-role-badge');
  if (role === 'describer') {
    badge.className = 'describe-role role-desc';
    badge.textContent = '🗣️ أنت تصف';
    document.getElementById('describe-word-text').textContent = word;
    document.getElementById('describe-word-area').classList.remove('hidden');
    document.getElementById('describe-guess-area').classList.add('hidden');
  } else {
    badge.className = 'describe-role role-guess';
    badge.textContent = '🤔 أنت تخمن';
    document.getElementById('describe-word-area').classList.add('hidden');
    document.getElementById('describe-guess-area').classList.remove('hidden');
    document.getElementById('guess-feedback').textContent = '';
  }
  document.getElementById('describe-result').classList.add('hidden');
});

socket.on('describe_wrong', ({ guess }) => {
  const fb = document.getElementById('guess-feedback');
  fb.textContent = '❌ "' + guess + '" — حاول مرة ثانية!';
  fb.style.color = '#F0997B';
});

socket.on('describe_correct', ({ guesser, word, scores }) => {
  state.scores = scores;
  updateScores();
  showSubSection('area-describe', 'describe-active');
  document.getElementById('describe-word-area').classList.add('hidden');
  document.getElementById('describe-guess-area').classList.add('hidden');
  document.getElementById('describe-result').classList.remove('hidden');
  document.getElementById('describe-result-text').textContent = guesser + ' خمّن الكلمة الصحيحة: ' + word + ' 🎉';
});

// PUZZLE EVENTS
socket.on('puzzle_started', ({ pieces }) => {
  renderPuzzle(pieces);
});

socket.on('puzzle_piece_moved', ({ pieceId, position, by }) => {
  if (by !== state.name) {
    addSystemMsg(by + ' حرّك قطعة 🧩');
  }
});

socket.on('puzzle_solved', ({ scores, players }) => {
  state.scores = scores;
  updateScores();
  showSubSection('area-puzzle', 'puzzle-solved');
});

socket.on('puzzle_wrong', () => {
  document.getElementById('puzzle-feedback').textContent = '❌ الترتيب غلط، حاول مرة ثانية!';
  state.puzzle.slotOrder = [];
  state.puzzle.selected = [];
  document.querySelectorAll('.puzzle-slot').forEach(s => { s.textContent = ''; s.classList.remove('filled'); });
  document.querySelectorAll('.puzzle-piece').forEach(p => p.classList.remove('selected'));
});

// DAILY EVENTS
socket.on('daily_data', ({ challenge, question }) => {
  document.getElementById('daily-challenge').textContent = challenge;
  document.getElementById('daily-question-text').textContent = question.q;
  const opts = document.getElementById('daily-opts');
  opts.innerHTML = '';
  document.getElementById('daily-answer').classList.add('hidden');
  question.opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'daily-opt';
    btn.textContent = opt;
    btn.onclick = () => {
      document.querySelectorAll('.daily-opt').forEach((b, j) => {
        b.classList.add(j === question.ans ? 'correct' : 'wrong');
        b.disabled = true;
      });
      document.getElementById('daily-answer').classList.remove('hidden');
      document.getElementById('daily-answer').textContent = i === question.ans ? '✅ إجابة صحيحة!' : '❌ الإجابة: ' + question.opts[question.ans];
    };
    opts.appendChild(btn);
  });
});
