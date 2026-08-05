/* ============================================================================
   Wall Rally — Ballwechsel gegen die Wand.

   Wird NICHT beim Seitenaufruf geladen, sondern erst wenn jemand auf
   „Los geht's" klickt (siehe main.js, Abschnitt Spiel). window.wallRally()
   richtet das Spielfeld ein und startet sofort.

   Die Schleife endet, sobald der Ball durch ist — im Leerlauf keine Rechenzeit.
   Steuerung: Maus, Finger, Pfeiltasten.
   ========================================================================== */
window.wallRally = function(){
  const canvas = document.getElementById('court');
  const ctx = canvas.getContext('2d');
  const frame = document.getElementById('courtFrame');
  const rallyNumEl = document.getElementById('rallyNum');
  const bestLabelEl = document.getElementById('bestLabel');
  const startOverlay = document.getElementById('startOverlay');
  const overOverlay = document.getElementById('overOverlay');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const finalScoreEl = document.getElementById('finalScore');
  const scoreSubEl = document.getElementById('scoreSub');
  const bestTagWrap = document.getElementById('bestTagWrap');
  const toastEl = document.getElementById('toast');

  // Beschriftungen kommen aus dem HTML, damit sie übersetzbar sind.
  const box = document.querySelector('[data-game]');
  const L = (name, standard) => (box && box.getAttribute('data-t-' + name)) || standard;

  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, DPR = 1;
  let best = 0;
  let state = 'idle'; // idle | playing | over
  let score = 0;

  const paddle = { x:0, y:0, w:0, h:0, targetX:0 };
  const ball = { x:0, y:0, vx:0, vy:0, r:0 };
  const trail = [];
  const WALL_H_RATIO = 0.09;

  let toastTimer = null;
  function showToast(text){
    if(reducedMotion) return;
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>toastEl.classList.remove('show'), 700);
  }

  function resize(){
    const rect = frame.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);

    paddle.w = W * 0.24;
    paddle.h = H * 0.018;
    paddle.y = H * 0.88;
    if(paddle.x === 0) paddle.x = W/2 - paddle.w/2;
    paddle.targetX = paddle.x;

    ball.r = W * 0.024;
  }

  function resetBall(serve){
    ball.x = W/2;
    ball.y = H * (WALL_H_RATIO + 0.06);
    const speed = H * 0.62;
    const angle = (Math.random()*0.5 - 0.25);
    ball.vx = speed * Math.sin(angle);
    ball.vy = speed * Math.cos(angle);
    trail.length = 0;
  }

  function startGame(){
    score = 0;
    rallyNumEl.textContent = '0';
    paddle.x = W/2 - paddle.w/2;
    paddle.targetX = paddle.x;
    resetBall(true);
    state = 'playing';
    startOverlay.classList.add('hidden');
    overOverlay.classList.add('hidden');
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function endGame(){
    state = 'over';
    if(score > best){
      best = score;
      bestTagWrap.innerHTML = '<div class="best-tag">' + L('record', 'Neuer Bestwert!') + '</div>';
    } else {
      bestTagWrap.innerHTML = '';
    }
    bestLabelEl.textContent = L('best','Best') + ' ' + best;
    finalScoreEl.textContent = score;
    scoreSubEl.textContent = L('rallies', 'Ballwechsel geschafft');
    overOverlay.classList.remove('hidden');
  }

  function drawCourt(){
    ctx.clearRect(0,0,W,H);

    const grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,'#176B4A');
    grad.addColorStop(1,'#1B7350');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,H);

    const wallH = H * WALL_H_RATIO;
    const wallGrad = ctx.createLinearGradient(0,0,0,wallH);
    wallGrad.addColorStop(0,'#0B2A1D');
    wallGrad.addColorStop(1,'#123D2C');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0,0,W,wallH);

    ctx.strokeStyle = 'rgba(247,245,239,0.18)';
    ctx.lineWidth = 1;
    for(let x=-wallH; x<W+wallH; x+=10){
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x+wallH, wallH);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, wallH);
    ctx.lineTo(W, wallH);
    ctx.stroke();

    const inset = W * 0.05;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(inset, wallH);
    ctx.lineTo(inset, H);
    ctx.moveTo(W-inset, wallH);
    ctx.lineTo(W-inset, H);
    ctx.stroke();

    ctx.setLineDash([6,8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.moveTo(W/2, wallH);
    ctx.lineTo(W/2, H);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(inset, H*0.55);
    ctx.lineTo(W-inset, H*0.55);
    ctx.stroke();
  }

  function drawPaddle(){
    const x = paddle.x, y = paddle.y, w = paddle.w, h = paddle.h;
    ctx.fillStyle = '#0C1310';
    roundRect(ctx, x, y, w, h, h/2);
    ctx.fill();
    ctx.fillStyle = '#C8D95B';
    roundRect(ctx, x + w*0.12, y + h*0.28, w*0.76, h*0.44, h*0.2);
    ctx.fill();
  }

  function roundRect(c,x,y,w,h,r){
    c.beginPath();
    c.moveTo(x+r,y);
    c.arcTo(x+w,y,x+w,y+h,r);
    c.arcTo(x+w,y+h,x,y+h,r);
    c.arcTo(x,y+h,x,y,r);
    c.arcTo(x,y,x+w,y,r);
    c.closePath();
  }

  function drawBall(){
    if(!reducedMotion){
      trail.push({x:ball.x, y:ball.y});
      if(trail.length > 7) trail.shift();
      for(let i=0;i<trail.length;i++){
        const p = trail[i];
        const a = (i+1)/trail.length * 0.25;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#C8D95B';
        ctx.beginPath();
        ctx.arc(p.x, p.y, ball.r*0.8, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#C8D95B';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(18,20,15,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r*0.62, 0.4, 2.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r*0.62, 3.5, 5.3);
    ctx.stroke();
  }

  let lastTime = 0;
  function loop(now){
    if(state !== 'playing') return;
    let dt = (now - lastTime) / 1000;
    dt = Math.min(dt, 0.05);
    lastTime = now;

    // Tastatursteuerung laeuft jetzt in der Schleife statt in einem Dauertimer,
    // und zwar zeitbasiert - dadurch unabhaengig von der Bildwiederholrate.
    if(keys['ArrowLeft'])  paddle.targetX -= W * 1.25 * dt;
    if(keys['ArrowRight']) paddle.targetX += W * 1.25 * dt;

    paddle.x += (paddle.targetX - paddle.x) * Math.min(1, dt*14);
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    const wallH = H * WALL_H_RATIO;
    if(ball.x - ball.r < 0){ ball.x = ball.r; ball.vx *= -1; }
    if(ball.x + ball.r > W){ ball.x = W - ball.r; ball.vx *= -1; }
    if(ball.y - ball.r < wallH){
      ball.y = wallH + ball.r;
      ball.vy *= -1;
      ball.vx += (Math.random()*60 - 30);
    }

    if(ball.vy > 0 &&
       ball.y + ball.r >= paddle.y &&
       ball.y + ball.r <= paddle.y + paddle.h + ball.r &&
       ball.x >= paddle.x - ball.r &&
       ball.x <= paddle.x + paddle.w + ball.r){

      const rel = ((ball.x - (paddle.x + paddle.w/2)) / (paddle.w/2));
      const clamped = Math.max(-1, Math.min(1, rel));
      const maxAngle = Math.PI/3;
      const angle = clamped * maxAngle;

      const speed = Math.min(Math.hypot(ball.vx, ball.vy) * 1.035, H * 1.8);
      ball.vx = speed * Math.sin(angle);
      ball.vy = -Math.abs(speed * Math.cos(angle));
      ball.y = paddle.y - ball.r - 0.5;

      score += 1;
      rallyNumEl.textContent = score;

      if(score === 10) showToast(L('t10','Stark!'));
      else if(score === 25) showToast(L('t25','Am Laufen!'));
      else if(score === 50) showToast(L('t50','Unglaublich!'));
      else if(score === 100) showToast(L('t100','Matchball-Form!'));
    }

    if(ball.y - ball.r > H){
      drawCourt(); drawPaddle();
      endGame();
      return;
    }

    drawCourt();
    drawBall();
    drawPaddle();

    requestAnimationFrame(loop);
  }

  function pointerX(clientX){
    const rect = canvas.getBoundingClientRect();
    return clientX - rect.left;
  }
  canvas.addEventListener('mousemove', (e)=>{
    paddle.targetX = pointerX(e.clientX) - paddle.w/2;
  });
  canvas.addEventListener('touchmove', (e)=>{
    e.preventDefault();
    const t = e.touches[0];
    paddle.targetX = pointerX(t.clientX) - paddle.w/2;
  }, {passive:false});
  canvas.addEventListener('touchstart', (e)=>{
    const t = e.touches[0];
    paddle.targetX = pointerX(t.clientX) - paddle.w/2;
  });

  const keys = {};
  window.addEventListener('keydown', (e)=>{
    // Pfeiltasten nur abfangen, solange tatsaechlich gespielt wird - sonst
    // koennte man die Seite nicht mehr mit der Tastatur scrollen.
    if(state === 'playing' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) e.preventDefault();
    keys[e.key] = true;
  });
  window.addEventListener('keyup', (e)=>{ keys[e.key] = false; });

  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden && state === 'playing'){
      lastTime = performance.now();
    }
  });

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  window.addEventListener('resize', ()=>{
    const wasPlaying = state === 'playing';
    resize();
    if(!wasPlaying){ drawCourt(); drawPaddle(); }
  });

  resize();
  drawCourt();
  drawPaddle();
  bestLabelEl.textContent = L('best','Best') + ' 0';
  startGame();
};
