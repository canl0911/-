/* ===================== 工具函数 ===================== */
function $(id){ return document.getElementById(id); }
function save(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function load(key, def){
    try { return JSON.parse(localStorage.getItem(key)) || def; }
    catch(e){ return def; }
}
function formatDate(d){
    return d.getFullYear() + '-' +
        String(d.getMonth()+1).padStart(2,'0') + '-' +
        String(d.getDate()).padStart(2,'0');
}
function getToday(){ return formatDate(new Date()); }
function getWeekStart(){
    var d = new Date();
    var day = d.getDay();
    var diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return formatDate(d);
}
function getMonthStart(){
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-01';
}
function escapeHtml(s){
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function uid(){
    return Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}
function normalizeName(s){
    return String(s).replace(/\s+/g, '').toLowerCase();
}
function toast(msg){
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function(){ t.classList.add('show'); });
    setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 320); }, 2200);
}

/* ===================== Tab 切换 ===================== */
function switchTab(name){
    document.querySelectorAll('.tab-btn').forEach(function(b){
        b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.tab-content').forEach(function(c){
        c.classList.toggle('active', c.id === 'tab-' + name);
    });
    if (name === 'calendar'){
        setTimeout(renderCalendar, 30);
    }
}
document.querySelectorAll('.tab-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ switchTab(this.dataset.tab); });
});
$('todayChip').addEventListener('click', function(){ switchTab('task'); });

/* ===================== 顶部状态 ===================== */
function updateHeaderChip(){
    var required = taskList.filter(isRequiredTask);
    var total = required.length;
    var done = required.filter(function(t){ return getTaskProgress(t).isComplete; }).length;
    $('chipNum').innerText = done + '/' + total;
}

/* ===================== 任务系统 ===================== */
var taskList = load("task_v2", []);
var TYPE_NAMES = { once: '单次', daily: '每日', weekly: '每周', monthly: '每月' };

function getTaskProgress(task){
    if (task.type === 'once') {
        return { current: task.done ? 1 : 0, target: 1, isComplete: !!task.done };
    }
    if (task.type === 'daily') {
        var doneToday = task.completedDates.indexOf(getToday()) !== -1;
        return { current: doneToday ? 1 : 0, target: 1, isComplete: doneToday };
    }
    if (task.type === 'weekly') {
        var ws = getWeekStart();
        var c = task.completedDates.filter(function(d){ return d >= ws; }).length;
        return { current: c, target: task.targetCount, isComplete: c >= task.targetCount };
    }
    if (task.type === 'monthly') {
        var ms = getMonthStart();
        var c = task.completedDates.filter(function(d){ return d >= ms; }).length;
        return { current: c, target: task.targetCount, isComplete: c >= task.targetCount };
    }
    return { current: 0, target: 1, isComplete: false };
}

function isRequiredTask(task){
    if (task.scheduledDate){
        return task.scheduledDate === getToday() && !task.done;
    }
    if (task.type === 'once') return !task.done;
    if (task.type === 'daily') return true;
    return false;
}
function isTaskToday(task){
    if (task.scheduledDate){
        return task.scheduledDate === getToday() && !task.done;
    }
    if (task.type === 'once') return !task.done;
    if (task.type === 'daily') return true;
    if (task.type === 'weekly' || task.type === 'monthly') {
        var p = getTaskProgress(task);
        if (p.isComplete) return false;
        return true;
    }
    return false;
}
function isPeriodicDoneToday(task){
    if (task.type !== 'weekly' && task.type !== 'monthly') return false;
    return (task.completedDates || []).indexOf(getToday()) !== -1;
}

function hasSameTask(name){
    var target = normalizeName(name);
    return taskList.some(function(t){ return normalizeName(t.name) === target; });
}

function addTaskToList(name, type, targetCount, energy, dependsOn, scheduledDate){
    taskList.push({
        id: uid(),
        name: name,
        type: type,
        targetCount: targetCount,
        completedDates: [],
        done: false,
        createdAt: getToday(),
        energy: energy || 'mid',
        dependsOn: dependsOn || null,
        scheduledDate: scheduledDate || null
    });
    save("task_v2", taskList);
    renderTask();
    loadCheck();
}

var currentFilter = 'all';
var ENERGY_NAMES = { high: '高耗能', mid: '中等耗能', low: '轻松' };

function getDepTask(task){
    if (!task.dependsOn) return null;
    return taskList.find(function(t){ return t.id === task.dependsOn; }) || null;
}
function isLocked(task){
    var dep = getDepTask(task);
    if (!dep) return false;
    return !getTaskProgress(dep).isComplete;
}
function wouldCycle(task, depId){
    var cur = taskList.find(function(t){ return t.id === depId; });
    var guard = 0;
    while (cur && cur.dependsOn && guard++ < 20){
        if (cur.dependsOn === task.id) return true;
        cur = taskList.find(function(t){ return t.id === cur.dependsOn; });
    }
    return false;
}

function renderTask(){
    var dom = $("taskList");
    dom.innerHTML = "";
    var visible = taskList.filter(function(t){
        return currentFilter === 'all' || t.type === currentFilter;
    });
    if (visible.length === 0){
        var li = document.createElement('li');
        li.className = 'empty-tip';
        li.innerText = '暂无任务，添加一个吧';
        dom.appendChild(li);
    } else {
        visible.forEach(function(item){
            var idx = taskList.indexOf(item);
            var li = document.createElement("li");
            li.style.flexDirection = 'column';
            li.style.alignItems = 'stretch';

            var topRow = document.createElement("div");
            topRow.style.display = 'flex';
            topRow.style.alignItems = 'center';
            topRow.style.justifyContent = 'space-between';
            topRow.style.gap = '10px';

            var name = document.createElement("span");
            name.className = "task-name";
            name.innerHTML = escapeHtml(item.name);

            var tag = document.createElement("span");
            tag.className = "tag tag-" + item.type;
            tag.innerText = TYPE_NAMES[item.type];
            name.appendChild(tag);

            if (item.scheduledDate){
                var dateTag = document.createElement("span");
                dateTag.className = "tag";
                dateTag.style.background = "#E8F2FD";
                dateTag.style.color = "#1D5FA8";
                dateTag.innerText = item.scheduledDate;
                name.appendChild(dateTag);
            }

            var reqBadge = document.createElement("span");
            var required = isRequiredTask(item);
            reqBadge.className = "req-badge " + (required ? "req-required" : "req-optional");
            reqBadge.innerText = required ? "必做" : "可选";
            name.appendChild(reqBadge);

            var edot = document.createElement("span");
            edot.className = "energy-dot " + (item.energy || 'mid');
            edot.title = '精力：' + ENERGY_NAMES[item.energy || 'mid'];
            name.appendChild(edot);

            var p = getTaskProgress(item);
            if (item.type === 'weekly' || item.type === 'monthly'){
                var ps = document.createElement("span");
                ps.className = "progress-text";
                ps.innerText = p.current + "/" + p.target;
                name.appendChild(ps);
                if (isPeriodicDoneToday(item) && !p.isComplete){
                    var doneToday = document.createElement("span");
                    doneToday.className = "done-today-tag";
                    doneToday.innerText = "今天已做";
                    name.appendChild(doneToday);
                }
            }
            if (isLocked(item)){
                var depTag = document.createElement("span");
                depTag.className = "dep-tag";
                depTag.innerText = '待前置';
                name.appendChild(depTag);
            }
            if (p.isComplete) name.classList.add("finish");

            var btns = document.createElement("div");
            btns.className = "task-btns";

            var bDone = document.createElement("button");
            if (isLocked(item)){
                bDone.className = "btn-ghost";
                bDone.innerText = "待前置";
                bDone.disabled = true;
            } else if (item.type === 'weekly' || item.type === 'monthly'){
                var doneTodayFlag = isPeriodicDoneToday(item);
                if (doneTodayFlag){
                    bDone.className = "btn-ghost";
                    bDone.innerText = "撤销今日";
                    bDone.onclick = function(){ toggleTask(idx); };
                } else if (p.isComplete){
                    bDone.className = "btn-ghost";
                    bDone.innerText = "已完成";
                    bDone.disabled = true;
                } else {
                    bDone.className = "btn-primary";
                    bDone.innerText = "完成今日";
                    bDone.onclick = function(){ toggleTask(idx); };
                }
            } else {
                bDone.className = p.isComplete ? "btn-ghost" : "btn-primary";
                bDone.innerText = p.isComplete ? "撤销" : "完成";
                bDone.onclick = function(){ toggleTask(idx); };
            }

            var bDel = document.createElement("button");
            bDel.className = "btn-ghost";
            bDel.innerText = "删除";
            bDel.onclick = function(){ deleteTask(idx); };

            btns.appendChild(bDone);
            btns.appendChild(bDel);
            topRow.appendChild(name);
            topRow.appendChild(btns);
            li.appendChild(topRow);

            var sub = document.createElement("div");
            sub.className = "task-sub";

            var lbl1 = document.createElement("span");
            lbl1.className = "sub-label";
            lbl1.innerText = "前置";
            var depSel = document.createElement("select");
            var optNone = document.createElement("option");
            optNone.value = "";
            optNone.innerText = "无";
            depSel.appendChild(optNone);
            var depTargets = taskList.filter(function(t){
                return t.id !== item.id && !getTaskProgress(t).isComplete;
            });
            depTargets.forEach(function(t){
                var o = document.createElement("option");
                o.value = t.id;
                o.innerText = t.name.slice(0, 12);
                if (item.dependsOn === t.id) o.selected = true;
                depSel.appendChild(o);
            });
            depSel.addEventListener('change', function(){
                var v = this.value;
                if (v && wouldCycle(item, v)){
                    alert("不能形成循环依赖：该任务（或其后置任务）依赖于当前任务。");
                    renderTask();
                    return;
                }
                item.dependsOn = v || null;
                save("task_v2", taskList);
                renderTask();
            });

            var lbl2 = document.createElement("span");
            lbl2.className = "sub-label";
            lbl2.innerText = "精力";
            var enSel = document.createElement("select");
            ['high','mid','low'].forEach(function(k){
                var o = document.createElement("option");
                o.value = k;
                o.innerText = ENERGY_NAMES[k];
                if ((item.energy || 'mid') === k) o.selected = true;
                enSel.appendChild(o);
            });
            enSel.addEventListener('change', function(){
                item.energy = this.value;
                save("task_v2", taskList);
                renderTask();
            });

            sub.appendChild(lbl1);
            sub.appendChild(depSel);
            sub.appendChild(lbl2);
            sub.appendChild(enSel);
            li.appendChild(sub);

            dom.appendChild(li);
        });
    }
    $("taskCountText").innerText = "共 " + taskList.length + " 个";
    updateRiskPanel();
    updateHeaderChip();
    updateEnergyTip();
    updatePeriodicTip();
}

$('taskFilter').addEventListener('click', function(e){
    var btn = e.target.closest('.f-btn');
    if (!btn) return;
    currentFilter = btn.dataset.type;
    this.querySelectorAll('.f-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    renderTask();
});

$('taskForm').addEventListener('submit', function(e){
    e.preventDefault();
    var val = $("taskInput").value.trim();
    if (!val) return;
    var type = $("taskType").value;
    var count = parseInt($("taskCount").value) || 1;
    if (type === 'once' || type === 'daily') count = 1;

    if (hasSameTask(val)){
        if (!confirm("任务【" + val + "】已经存在了，您确定还要添加吗？")) return;
    }
    addTaskToList(val, type, count, $("taskEnergy").value);
    $("taskInput").value = "";
});

function toggleTask(idx){
    var task = taskList[idx];
    var today = getToday();

    if (task.scheduledDate){
        task.done = !task.done;
    } else if (task.type === 'once'){
        task.done = !task.done;
    } else {
        if (task.completedDates.indexOf(today) === -1){
            task.completedDates.push(today);
            boostGoals();
        } else {
            task.completedDates = task.completedDates.filter(function(d){ return d !== today; });
        }
    }
    save("task_v2", taskList);
    renderTask();
    loadCheck();
    updateEnergyTip();
    updatePeriodicTip();
}

function deleteTask(idx){
    if (!confirm("确定删除这个任务吗？")) return;
    taskList.splice(idx, 1);
    save("task_v2", taskList);
    renderTask();
    loadCheck();
}

/* ===================== 番茄钟 ===================== */
var pomodoro = {
    workMinutes: 25,
    breakMinutes: 5,
    mode: 'work',
    remaining: 25 * 60,
    endTime: null,
    isRunning: false,
    intervalId: null,
    sessionNo: 1
};

function updatePomodoroDisplay(){
    var m = Math.floor(pomodoro.remaining / 60);
    var s = pomodoro.remaining % 60;
    $("pomodoroTime").innerText = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');

    var modeEl = $("pomodoroMode");
    if (pomodoro.mode === 'work'){
        modeEl.innerText = "专注中";
        modeEl.classList.remove('break');
    } else {
        modeEl.innerText = "休息中";
        modeEl.classList.add('break');
    }
    $("pomodoroSession").innerText = "第 " + pomodoro.sessionNo + " 个番茄";
    $("pomodoroBtn").innerText = pomodoro.isRunning ? "暂停" : "开始";
}

$('presetRow').addEventListener('click', function(e){
    var btn = e.target.closest('.preset');
    if (!btn) return;
    if (btn.dataset.w){
        setPomodoro(parseInt(btn.dataset.w), parseInt(btn.dataset.b), btn);
        $('customRow').style.display = 'none';
    } else {
        $('customRow').style.display = 'flex';
    }
});

$('customApply').addEventListener('click', function(){
    var w = parseInt($('customWork').value) || 0;
    var b = parseInt($('customBreak').value) || 0;
    if (w < 1 || w > 180){ alert('专注时长需在 1-180 分钟之间'); return; }
    if (b < 1 || b > 60){ alert('休息时长需在 1-60 分钟之间'); return; }
    var btn = $('customPreset');
    setPomodoro(w, b, btn);
    btn.innerText = '自定义 ' + w + '+' + b;
    $('customRow').style.display = 'none';
});

function setPomodoro(work, brk, btn){
    if (pomodoro.isRunning){
        if (!confirm("当前计时正在进行中，切换预设会重新开始，确定吗？")) return;
    }
    clearInterval(pomodoro.intervalId);
    pomodoro.workMinutes = work;
    pomodoro.breakMinutes = brk;
    pomodoro.mode = 'work';
    pomodoro.remaining = work * 60;
    pomodoro.isRunning = false;
    pomodoro.endTime = null;
    pomodoro.sessionNo = 1;

    document.querySelectorAll('.preset').forEach(function(b){ b.classList.remove('active'); });
    if (btn) btn.classList.add('active');

    updatePomodoroDisplay();
    updatePomodoroCount();
}

function togglePomodoro(){
    ensureAudioCtx();
    if (pomodoro.isRunning){
        clearInterval(pomodoro.intervalId);
        pomodoro.isRunning = false;
        pomodoro.remaining = Math.max(0, Math.round((pomodoro.endTime - Date.now()) / 1000));
    } else {
        pomodoro.endTime = Date.now() + pomodoro.remaining * 1000;
        pomodoro.isRunning = true;
        pomodoro.intervalId = setInterval(tickPomodoro, 250);
    }
    updatePomodoroDisplay();
}

function tickPomodoro(){
    if (!pomodoro.isRunning) return;
    var remain = Math.max(0, Math.round((pomodoro.endTime - Date.now()) / 1000));
    pomodoro.remaining = remain;
    updatePomodoroDisplay();
    if (remain <= 0){ completePomodoroSession(); }
}

function completePomodoroSession(){
    clearInterval(pomodoro.intervalId);
    pomodoro.isRunning = false;
    playBeep();

    if (pomodoro.mode === 'work'){
        addPomodoroRecord();
        alert("专注完成！起来活动一下，休息 " + pomodoro.breakMinutes + " 分钟吧~");
        pomodoro.mode = 'break';
        pomodoro.remaining = pomodoro.breakMinutes * 60;
    } else {
        alert("休息结束，开始下一个番茄！");
        pomodoro.mode = 'work';
        pomodoro.sessionNo++;
        pomodoro.remaining = pomodoro.workMinutes * 60;
    }
    pomodoro.endTime = null;
    updatePomodoroDisplay();
    updatePomodoroCount();
}

function resetPomodoro(){
    clearInterval(pomodoro.intervalId);
    pomodoro.isRunning = false;
    pomodoro.mode = 'work';
    pomodoro.remaining = pomodoro.workMinutes * 60;
    pomodoro.endTime = null;
    updatePomodoroDisplay();
}

function skipSession(){
    if (!confirm("确定跳过当前阶段吗？")) return;
    completePomodoroSession();
}

var pomodoroConfig = load('pomodoroConfig', { ringtone: 'bell', customDataUrl: '' });
var audioCtx = null;
var RING_NAMES = { bell: '经典', digital: '数码', soft: '轻柔', custom: '自定义' };

function ensureAudioCtx(){
    if (!audioCtx){
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
    }
    if (audioCtx && audioCtx.state === 'suspended'){ audioCtx.resume().catch(function(){}); }
    return audioCtx;
}
function ringBell(ctx){
    [0, 320, 640].forEach(function(delay){
        setTimeout(function(){
            var o = ctx.createOscillator(), g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.09;
            o.start();
            try { o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.18); } catch(e){}
            setTimeout(function(){ o.stop(); }, 200);
        }, delay);
    });
}
function ringDigital(ctx){
    [0, 130, 260, 390, 520, 650].forEach(function(delay){
        setTimeout(function(){
            var o = ctx.createOscillator(), g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = 'square'; o.frequency.value = 1046; g.gain.value = 0.05;
            o.start(); setTimeout(function(){ o.stop(); }, 90);
        }, delay);
    });
}
function ringSoft(ctx){
    var now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach(function(f, i){
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, now + i * 0.18);
        g.gain.linearRampToValueAtTime(0.07, now + i * 0.18 + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.5);
        o.start(now + i * 0.18); o.stop(now + i * 0.18 + 0.55);
    });
}
function playBeep(){
    var cfg = pomodoroConfig || { ringtone: 'bell', customDataUrl: '' };
    if (cfg.ringtone === 'custom' && cfg.customDataUrl){
        try {
            var a = new Audio(cfg.customDataUrl);
            a.play().catch(function(){});
        } catch(e){}
        return;
    }
    try {
        var ctx = ensureAudioCtx();
        if (!ctx) return;
        if (cfg.ringtone === 'digital') ringDigital(ctx);
        else if (cfg.ringtone === 'soft') ringSoft(ctx);
        else ringBell(ctx);
    } catch(e){}
}
function renderRingtoneUI(){
    var cfg = pomodoroConfig || { ringtone: 'bell', customDataUrl: '' };
    document.querySelectorAll('.ring-preset').forEach(function(b){
        b.classList.toggle('active', b.dataset.ring === cfg.ringtone);
    });
    var tip = $('ringtoneTip');
    if (tip) tip.innerText = RING_NAMES[cfg.ringtone] || '经典';
}
var ringTestBtn = $('ringTestBtn');
if (ringTestBtn) ringTestBtn.addEventListener('click', function(){
    ensureAudioCtx();
    playBeep();
});
var ringUploadBtn = $('ringUploadBtn');
if (ringUploadBtn) ringUploadBtn.addEventListener('click', function(){ $('ringFile').click(); });
var ringFile = $('ringFile');
if (ringFile) ringFile.addEventListener('change', function(){
    var f = this.files[0];
    if (!f) return;
    if (f.size > 300 * 1024){ alert('音频文件需小于 300KB'); this.value = ''; return; }
    if (!/^audio\//.test(f.type)){ alert('请选择音频文件'); this.value = ''; return; }
    var r = new FileReader();
    r.onload = function(){
        pomodoroConfig.ringtone = 'custom';
        pomodoroConfig.customDataUrl = r.result;
        save('pomodoroConfig', pomodoroConfig);
        renderRingtoneUI();
        toast('自定义铃声已保存');
    };
    r.readAsDataURL(f);
    this.value = '';
});
document.querySelectorAll('.ring-preset').forEach(function(b){
    b.addEventListener('click', function(){
        pomodoroConfig.ringtone = this.dataset.ring;
        save('pomodoroConfig', pomodoroConfig);
        renderRingtoneUI();
    });
});

function getPomodoroRecords(){ return load("pomodoroRecords", {}); }
function addPomodoroRecord(){
    var records = getPomodoroRecords();
    var today = getToday();
    records[today] = (records[today] || 0) + 1;
    save("pomodoroRecords", records);
}
function getTodayPomodoroCount(){ return getPomodoroRecords()[getToday()] || 0; }
function updatePomodoroCount(){
    $("pomodoroCount").innerText = "今日已完成 " + getTodayPomodoroCount() + " 个番茄";
}

$('pomodoroBtn').addEventListener('click', togglePomodoro);

/* ===================== 考试倒计时 ===================== */
var exams = load('exams_v1', []);

function migrateExams(){
    if (exams.length) return;
    var type = load('examType', '');
    var date = load('examDate', '');
    if (type || date){
        var name = type === '其他' ? (load('customExamName', '') || '自定义考试') : (type || '考试');
        if (date) exams.push({ id: uid(), name: name, date: date });
        save('exams_v1', exams);
    }
}
function getPrimaryExam(){
    var today = getToday();
    var upcoming = exams.filter(function(e){ return e.date >= today; }).sort(function(a,b){ return a.date.localeCompare(b.date); });
    if (upcoming.length) return upcoming[0];
    if (exams.length) return exams.slice().sort(function(a,b){ return b.date.localeCompare(a.date); })[0];
    return null;
}
function calcCount(){
    var ex = getPrimaryExam();
    if (!ex) return null;
    var now = new Date(); now.setHours(0,0,0,0);
    var exam = new Date(ex.date + 'T00:00:00');
    return Math.round((exam - now) / (1000*60*60*24));
}
function getExamLabel(){
    var ex = getPrimaryExam();
    return ex ? ex.name : '考试';
}
function addExam(name, date){
    exams.push({ id: uid(), name: name, date: date });
    save('exams_v1', exams);
    if ($('examList')) renderExams();
    calcCountAndShow();
}
function renderExams(){
    var dom = $('examList');
    dom.innerHTML = '';
    if (!exams.length){
        var li = document.createElement('li');
        li.className = 'empty-tip';
        li.innerText = '还没有考试，添加一个开始倒计时吧';
        li.style.listStyle = 'none';
        dom.appendChild(li);
        return;
    }
    var today = getToday();
    var primary = getPrimaryExam();
    exams.slice().sort(function(a,b){ return a.date.localeCompare(b.date); }).forEach(function(e){
        var isPrimary = primary && primary.id === e.id;
        var li = document.createElement('li');
        li.className = 'exam-item' + (isPrimary ? ' primary' : '');
        var name = document.createElement('span');
        name.className = 'exam-name';
        name.innerText = e.name;
        li.appendChild(name);
        if (isPrimary){
            var badge = document.createElement('span');
            badge.className = 'exam-badge';
            badge.innerText = '主考试';
            li.appendChild(badge);
        }
        var date = document.createElement('span');
        date.className = 'exam-date';
        date.innerText = e.date;
        li.appendChild(date);
        var day = Math.round((new Date(e.date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
        var dayEl = document.createElement('span');
        dayEl.className = 'exam-day ' + (day > 0 ? 'up' : day === 0 ? 'today' : 'over');
        dayEl.innerText = day > 0 ? '还有 ' + day + ' 天' : day === 0 ? '就是今天' : '已结束 ' + (-day) + ' 天';
        li.appendChild(dayEl);
        var del = document.createElement('button');
        del.className = 'exam-del';
        del.innerText = '删除';
        del.onclick = function(){
            if (!confirm('确定删除考试【' + e.name + '】吗？')) return;
            exams = exams.filter(function(x){ return x.id !== e.id; });
            save('exams_v1', exams);
            renderExams();
            calcCountAndShow();
        };
        li.appendChild(del);
        dom.appendChild(li);
    });
}
$('examAddBtn').addEventListener('click', function(){
    var name = $('examNameInput').value.trim();
    var date = $('examNewDate').value;
    if (!name){ alert('请输入考试名称，如：四级 / 六级'); return; }
    if (!date){ alert('请选择考试日期'); return; }
    addExam(name, date);
    $('examNameInput').value = '';
    $('examNewDate').value = '';
    toast('已添加考试「' + name + '」');
});
$('examNameInput').addEventListener('keydown', function(e){ if (e.key === 'Enter') $('examAddBtn').click(); });

function updateRiskPanel(){
    var required = taskList.filter(isRequiredTask);
    var total = required.length;
    var done = required.filter(function(t){ return getTaskProgress(t).isComplete; }).length;

    $("riskPanel").style.display = "block";
    $("progressText").innerText = done + " / " + total;
    $("progressFill").style.width = (total === 0 ? 0 : Math.round(done/total*100)) + "%";

    var day = calcCount();
    var riskTip = $("riskTip");
    var dayInfo = (day !== null && day > 0) ? "距离【" + getExamLabel() + "】还有 " + day + " 天。" : "";

    if (total === 0){
        riskTip.innerHTML = "今日无必做任务，可以休息啦！" + dayInfo;
        return;
    }
    if (done === total){
        riskTip.innerHTML = "<span class='risk-low'>今日必做任务全部完成，太棒了！" + dayInfo + "</span>";
    } else {
        var remain = total - done;
        riskTip.innerHTML = "<span class='risk-medium'>今日还有 " + remain + " 个必做任务未完成。" + dayInfo + "</span>";
    }
}

function calcCountAndShow(){
    var day = calcCount();
    var label = getExamLabel();
    if (day === null){
        $("countTip").innerText = "请选择考试日期";
    } else if (day > 0){
        $("countTip").innerText = "距离【" + label + "】还有 " + day + " 天";
    } else if (day === 0){
        $("countTip").innerText = "今天就是【" + label + "】，祝顺利！";
    } else {
        $("countTip").innerText = "【" + label + "】已结束 " + (-day) + " 天";
    }
    updateRiskPanel();
    updateHeaderChip();
    if (typeof updateExamAdvice === 'function') updateExamAdvice();
}

/* ===================== 每日打卡 ===================== */
function checkIn(){
    var required = taskList.filter(isRequiredTask);
    var allDone = required.every(function(t){ return getTaskProgress(t).isComplete; });
    if (!allDone){
        alert("还有必做任务没完成，先去完成它们再打卡吧！\n（周任务 / 月任务不参与每日打卡，只要周期内完成即可）");
        return;
    }
    var history = load("checkHistory", []);
    var today = getToday();
    if (history.indexOf(today) === -1){
        history.push(today);
        save("checkHistory", history);
    }
    loadCheck();
}

function calcStreak(){
    var history = load("checkHistory", []);
    var set = {};
    history.forEach(function(d){ set[d] = true; });
    var streak = 0;
    var d = new Date();
    while (true){
        var key = formatDate(d);
        if (set[key]){ streak++; d.setDate(d.getDate() - 1); }
        else { break; }
    }
    return streak;
}

function loadCheck(){
    var history = load("checkHistory", []);
    var today = getToday();
    var checkedToday = history.indexOf(today) !== -1;

    var required = taskList.filter(isRequiredTask);
    var allRequiredDone = required.every(function(t){ return getTaskProgress(t).isComplete; });

    var streak = calcStreak();
    var total = history.length;

    var btn = $("checkInBtn");
    var meta = $("checkMeta");

    if (checkedToday){
        btn.disabled = true;
        btn.innerText = "已打卡";
        meta.innerText = "今日已打卡";
    } else if (required.length === 0){
        btn.disabled = false;
        btn.innerText = "打卡";
        meta.innerText = "今日无必做任务，可直接打卡";
    } else if (!allRequiredDone){
        btn.disabled = true;
        btn.innerText = "打卡";
        meta.innerText = "完成必做任务后可打卡（周/月任务不计入）";
    } else {
        btn.disabled = false;
        btn.innerText = "打卡";
        meta.innerText = "必做任务已完成，可以打卡";
    }
    if (streak > 0 || total > 0){
        meta.innerText += " · 连续 " + streak + " 天 · 累计 " + total + " 天";
    }
}
$('checkInBtn').addEventListener('click', checkIn);

/* ===================== 备忘录 ===================== */
var notes = load("notes", []);
var editingNoteId = null;

function renderNoteList(){
    var dom = $("noteList");
    dom.innerHTML = "";
    if (notes.length === 0){
        var li = document.createElement('li');
        li.className = 'empty-tip';
        li.innerText = '还没有备忘录，点上方按钮新建';
        li.style.listStyle = 'none';
        dom.appendChild(li);
        return;
    }
    var sorted = notes.slice().sort(function(a,b){ return b.updatedAt.localeCompare(a.updatedAt); });
    sorted.forEach(function(n){
        var li = document.createElement("li");
        li.className = "note-item";
        li.onclick = function(){ openNote(n.id); };
        var title = document.createElement("div");
        title.className = "note-title";
        title.innerText = n.title || "无标题";
        var preview = document.createElement("div");
        preview.className = "note-preview";
        preview.innerText = (n.content || "").slice(0, 50) || "（空）";
        var time = document.createElement("div");
        time.className = "note-time";
        time.innerText = n.updatedAt;
        li.appendChild(title);
        li.appendChild(preview);
        li.appendChild(time);
        dom.appendChild(li);
    });
}

function newNote(){
    editingNoteId = null;
    $("noteTitle").value = "";
    $("noteContent").value = "";
    $("noteListView").style.display = "none";
    $("noteEditView").style.display = "block";
}

function openNote(id){
    var n = notes.find(function(x){ return x.id === id; });
    if (!n) return;
    editingNoteId = id;
    $("noteTitle").value = n.title;
    $("noteContent").value = n.content;
    $("noteListView").style.display = "none";
    $("noteEditView").style.display = "block";
}

function saveNote(){
    var title = $("noteTitle").value.trim() || "无标题";
    var content = $("noteContent").value;
    var now = new Date();
    var timeStr = formatDate(now) + " " + String(now.getHours()).padStart(2,'0') + ":" + String(now.getMinutes()).padStart(2,'0');

    if (editingNoteId){
        var n = notes.find(function(x){ return x.id === editingNoteId; });
        if (n){ n.title = title; n.content = content; n.updatedAt = timeStr; }
    } else {
        notes.push({ id: uid(), title: title, content: content, updatedAt: timeStr });
    }
    save("notes", notes);
    cancelEdit();
    renderNoteList();
}

function deleteNote(){
    if (!editingNoteId){ cancelEdit(); return; }
    if (!confirm("确定删除这条备忘录吗？")) return;
    notes = notes.filter(function(x){ return x.id !== editingNoteId; });
    save("notes", notes);
    cancelEdit();
    renderNoteList();
}

function cancelEdit(){
    editingNoteId = null;
    $("noteEditView").style.display = "none";
    $("noteListView").style.display = "block";
}

/* ===================== 首次引导 ===================== */
var TASK_TEMPLATES = {
    '小升初': [
        {name:'每日口算练习20题', type:'daily'},
        {name:'每日阅读30分钟', type:'daily'},
        {name:'每周写一篇作文', type:'weekly', targetCount:1},
        {name:'每周整理一次错题', type:'weekly', targetCount:1}
    ],
    '中考': [
        {name:'每日背单词30个', type:'daily'},
        {name:'每日数学练习30分钟', type:'daily'},
        {name:'每日英语阅读1篇', type:'daily'},
        {name:'每周做一套真题', type:'weekly', targetCount:1},
        {name:'每周整理一次错题', type:'weekly', targetCount:1}
    ],
    '高考': [
        {name:'每日背单词50个', type:'daily'},
        {name:'每日数学刷题1小时', type:'daily'},
        {name:'每日英语阅读2篇', type:'daily'},
        {name:'每周做一套理综/文综', type:'weekly', targetCount:1},
        {name:'每周写一篇语文作文', type:'weekly', targetCount:1},
        {name:'每周整理错题本', type:'weekly', targetCount:1}
    ],
    '四级': [
        {name:'每日背单词50个', type:'daily'},
        {name:'每日听力练习20分钟', type:'daily'},
        {name:'每周写一篇英语作文', type:'weekly', targetCount:1},
        {name:'每周做一套真题', type:'weekly', targetCount:1}
    ],
    '六级': [
        {name:'每日背单词60个', type:'daily'},
        {name:'每日听力练习30分钟', type:'daily'},
        {name:'每周写一篇英语作文', type:'weekly', targetCount:1},
        {name:'每周做一套真题', type:'weekly', targetCount:1}
    ],
    '考研': [
        {name:'每日背单词50个', type:'daily'},
        {name:'每日政治刷题30分钟', type:'daily'},
        {name:'每日数学/专业课复习2小时', type:'daily'},
        {name:'每周做一套真题', type:'weekly', targetCount:1},
        {name:'每周复盘错题', type:'weekly', targetCount:1}
    ],
    '专升本': [
        {name:'每日背单词30个', type:'daily'},
        {name:'每日数学/专业课练习1小时', type:'daily'},
        {name:'每周做一套真题', type:'weekly', targetCount:1},
        {name:'每周整理错题', type:'weekly', targetCount:1}
    ],
    '其他': [
        {name:'每日学习1小时', type:'daily'},
        {name:'每周做一套练习题', type:'weekly', targetCount:1},
        {name:'每周整理一次笔记', type:'weekly', targetCount:1}
    ]
};

function checkSetup(){
    if (!localStorage.getItem('app_initialized')){
        $('setupOverlay').style.display = 'flex';
    }
}

$("setupExamType").onchange = function(){
    $("setupCustomWrap").style.display = this.value === '其他' ? 'block' : 'none';
};

function setupNext(){
    var type = $("setupExamType").value;
    if (!type){ alert('请选择考试类型'); return; }
    var date = $("setupExamDate").value;
    if (!date){ alert('请选择考试日期'); return; }

    var tasks = TASK_TEMPLATES[type] || TASK_TEMPLATES['其他'];
    var ul = $("suggestTaskList");
    ul.innerHTML = '';
    tasks.forEach(function(t, i){
        var li = document.createElement('li');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset.idx = i;
        var span = document.createElement('span');
        span.innerHTML = t.name + ' <span class="tag tag-' + t.type + '">' + TYPE_NAMES[t.type] + '</span>';
        li.appendChild(cb);
        li.appendChild(span);
        ul.appendChild(li);
    });
    $("setupStep2").style.display = 'block';
    $("setupNextBtn").style.display = 'none';
    $("setupConfirmBtn").style.display = 'inline-flex';
}

function setupConfirm(){
    var type = $("setupExamType").value;
    var custom = $("setupCustomName").value.trim();
    var date = $("setupExamDate").value;

    addExam(custom || type, date);

    var checked = document.querySelectorAll('#suggestTaskList input[type="checkbox"]:checked');
    var tasks = TASK_TEMPLATES[type] || TASK_TEMPLATES['其他'];
    checked.forEach(function(cb){
        var idx = parseInt(cb.dataset.idx);
        var t = tasks[idx];
        if (t && !hasSameTask(t.name)){ addTaskToList(t.name, t.type, t.targetCount || 1); }
    });

    localStorage.setItem('app_initialized', '1');
    $('setupOverlay').style.display = 'none';
    switchTab('ai');
}

function skipSetup(){
    localStorage.setItem('app_initialized', '1');
    $('setupOverlay').style.display = 'none';
}

/* ===================== 联网 AI ===================== */
var AI_CONFIG = load('ai_config', { mode: 'on', provider: 'free', apiKey: '', model: '' });
var PROVIDERS = {
    free: {
        name: '免费在线',
        url: 'https://text.pollinations.ai/',
        defaultModel: 'openai',
        keyName: null,
        hint: '无需密钥，开箱即用。由免费公共接口提供，网络波动时可能较慢或不可用。'
    },
    siliconflow: {
        name: '硅基流动 SiliconFlow',
        url: 'https://api.siliconflow.cn/v1/chat/completions',
        defaultModel: 'deepseek-ai/DeepSeek-V3',
        keyName: 'SiliconFlow API Key',
        hint: '国内直连。注册 cloud.siliconflow.cn 后在控制台创建密钥。'
    },
    deepseek: {
        name: 'DeepSeek',
        url: 'https://api.deepseek.com/chat/completions',
        defaultModel: 'deepseek-chat',
        keyName: 'DeepSeek API Key',
        hint: '国内直连。注册 platform.deepseek.com 后创建 API Key。'
    },
    openrouter: {
        name: 'OpenRouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        defaultModel: 'deepseek/deepseek-chat-v3-0324:free',
        keyName: 'OpenRouter API Key',
        hint: '聚合多家模型，含免费模型。注册 openrouter.ai 后创建密钥。'
    }
};

function buildSystemPrompt(){
    var lines = ['你是「学习规划助手」，帮助用户规划学习。回答简洁、具体、可执行，使用中文。'];
    var day = calcCount();
    var label = getExamLabel();
    var examInfo = '未设置';
    if (day !== null){
        examInfo = label + (day > 0 ? '，还有 ' + day + ' 天' : day === 0 ? '，就是今天' : '，已结束');
    }
    lines.push('用户当前状态：目标考试：' + examInfo);

    var todayTasks = taskList.filter(isRequiredTask);
    if (todayTasks.length > 0){
        var tl = todayTasks.map(function(t){
            var p = getTaskProgress(t);
            var extra = (t.type === 'weekly' || t.type === 'monthly') ? '（' + p.current + '/' + p.target + '）' : '';
            return '- ' + t.name + '[' + TYPE_NAMES[t.type] + ']' + extra + (p.isComplete ? ' 已完成' : ' 未完成');
        }).join('\n');
        lines.push('今日必做任务：\n' + tl);
    }
    lines.push('今日已完成番茄：' + getTodayPomodoroCount() + ' 个');
    var streak = calcStreak();
    if (streak > 0) lines.push('连续打卡：' + streak + ' 天');
    if (typeof goals !== 'undefined' && goals.length){
        lines.push('目标进度：' + goals.map(function(g){ return g.name + ' ' + g.progress + '%'; }).join('、'));
    }
    lines.push('说明：增删任务、设置考试等操作本应用会自动执行，你只需正常回答用户的提问和建议。');
    return lines.join('\n');
}

async function requestAI(text, isTest){
    var cfg = PROVIDERS[AI_CONFIG.provider] || PROVIDERS.free;
    var headers = { 'Content-Type': 'application/json' };
    var apiKey = isTest ? $('aiApiKey').value.trim() : AI_CONFIG.apiKey;
    var model = isTest ? ($('aiModel').value.trim() || cfg.defaultModel) : (AI_CONFIG.model || cfg.defaultModel);
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    if (AI_CONFIG.provider === 'openrouter') headers['HTTP-Referer'] = 'http://localhost';

    var messages;
    if (isTest){
        messages = [{ role: 'user', content: '请只回复四个字：连接成功' }];
    } else {
        messages = [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: text }
        ];
    }

    var ctrl = new AbortController();
    var timer = setTimeout(function(){ ctrl.abort(); }, 12000);
    try {
        var res = await fetch(cfg.url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: 0.7,
                max_tokens: isTest ? 24 : 900
            }),
            signal: ctrl.signal
        });
        var ct = res.headers.get('content-type') || '';
        if (!res.ok){
            var errText = await res.text().catch(function(){ return ''; });
            throw new Error('HTTP ' + res.status + (errText ? '：' + errText.slice(0, 100) : ''));
        }
        if (ct.indexOf('json') !== -1){
            var data = await res.json();
            if (data && data.choices && data.choices[0] && data.choices[0].message){
                return data.choices[0].message.content || '';
            }
            if (data && data.output_text) return data.output_text;
            return JSON.stringify(data).slice(0, 200);
        }
        return await res.text();
    } finally {
        clearTimeout(timer);
    }
}

/* ===================== AI 设置面板 ===================== */
function updateAiStatus(state){
    var bar = $('aiStatusBar');
    var txt = $('aiStatusText');
    if (state === 'busy'){
        bar.className = 'ai-status on';
        txt.innerText = 'AI 回复中…';
        return;
    }
    if (AI_CONFIG.mode === 'off'){
        bar.className = 'ai-status off';
        txt.innerText = '离线模式（本地规则回复）';
        return;
    }
    var cfg = PROVIDERS[AI_CONFIG.provider] || PROVIDERS.free;
    if (AI_CONFIG.provider === 'free'){
        bar.className = 'ai-status on';
        txt.innerText = '联网已开启 · 免费模式';
        return;
    }
    if (!AI_CONFIG.apiKey){
        bar.className = 'ai-status off';
        txt.innerText = '未配置密钥 · 暂时本地回复';
        return;
    }
    bar.className = 'ai-status on';
    txt.innerText = '联网已开启 · ' + cfg.name;
}

function openAiSettings(){
    $('aiModeSeg').querySelectorAll('.seg-btn').forEach(function(b){
        b.classList.toggle('active', b.dataset.mode === AI_CONFIG.mode);
    });
    $('aiProvider').value = AI_CONFIG.provider;
    $('aiApiKey').value = AI_CONFIG.apiKey || '';
    $('aiModel').value = AI_CONFIG.model || '';
    updateProviderHint();
    $('aiTestResult').className = 'test-result';
    $('aiTestResult').innerText = '';
    $('aiSettings').style.display = 'flex';
}
function closeAiSettings(){ $('aiSettings').style.display = 'none'; }
$('aiSettingsBtn').addEventListener('click', openAiSettings);
$('aiSettings').addEventListener('click', function(e){ if (e.target === this) closeAiSettings(); });

$('aiModeSeg').addEventListener('click', function(e){
    var b = e.target.closest('.seg-btn');
    if (!b) return;
    this.querySelectorAll('.seg-btn').forEach(function(x){ x.classList.remove('active'); });
    b.classList.add('active');
});

$('aiProvider').addEventListener('change', updateProviderHint);
function updateProviderHint(){
    var cfg = PROVIDERS[$('aiProvider').value] || PROVIDERS.free;
    $('aiProviderHint').innerText = cfg.hint || '';
    $('keyWrap').style.display = cfg.keyName ? 'block' : 'none';
}

function saveAiConfig(){
    AI_CONFIG.mode = $('aiModeSeg').querySelector('.seg-btn.active').dataset.mode;
    AI_CONFIG.provider = $('aiProvider').value;
    AI_CONFIG.apiKey = $('aiApiKey').value.trim();
    AI_CONFIG.model = $('aiModel').value.trim();
    save('ai_config', AI_CONFIG);
    closeAiSettings();
    updateAiStatus();
    toast(AI_CONFIG.mode === 'on' ? '已开启联网 AI' : '已切换为离线模式');
}

function setTestResult(msg, ok){
    var el = $('aiTestResult');
    el.className = 'test-result ' + (ok === true ? 'ok' : ok === false ? 'err' : '');
    el.innerText = msg;
}

async function testAi(){
    var cfg = PROVIDERS[$('aiProvider').value] || PROVIDERS.free;
    if (cfg.keyName && !$('aiApiKey').value.trim()){
        setTestResult('请先填写 API Key', false);
        return;
    }
    var btn = $('aiTestBtn');
    btn.disabled = true;
    btn.innerText = '测试中…';
    setTestResult('正在连接…');
    try {
        var reply = await requestAI('', true);
        setTestResult('连接成功：' + String(reply).slice(0, 60), true);
    } catch (err) {
        setTestResult('连接失败：' + err.message, false);
    } finally {
        btn.disabled = false;
        btn.innerText = '测试连接';
    }
}
/* ===================== 对话系统 ===================== */
var chatHistory = load("chat", []);
var isReplying = false;

function renderChat(){
    var box = $("chatBox");
    box.innerHTML = "";
    if (chatHistory.length === 0){
        var tip = document.createElement("div");
        tip.className = "msg ai loading";
        tip.innerText = "你好！我是你的学习规划助手，已支持联网。\n可以这样问我：\n· 帮我加一个每天背50个单词的任务\n· 我明年1月20号要考四级\n· 今天还有什么任务\n· 怎么背单词更高效？";
        box.appendChild(tip);
        return;
    }
    chatHistory.forEach(function(m){
        var div = document.createElement("div");
        div.className = "msg " + (m.role === 'system' ? 'system' : m.role);
        div.textContent = m.content;
        box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
}

function appendChatMessage(m) {
    var box = $("chatBox");
    var loadingTip = box.querySelector('.msg.loading');
    if (loadingTip) loadingTip.remove();
    var div = document.createElement("div");
    div.className = "msg " + (m.role === 'system' ? 'system' : m.role);
    div.textContent = m.content;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function pushAi(content, isSystem){
    var m = { role: isSystem ? 'system' : 'ai', content: content };
    chatHistory.push(m);
    appendChatMessage(m);
    saveChat();
}

function sendMsg(autoText){
    var input = $("chatInput");
    var text = autoText || input.value.trim();
    if (!text || isReplying) return;
    if (!autoText) input.value = "";
    var userMsg = { role: "user", content: text };
    chatHistory.push(userMsg);
    appendChatMessage(userMsg);
    saveChat();

    var box = $("chatBox");
    var loading = document.createElement("div");
    loading.className = "msg ai loading";
    loading.innerText = "思考中…";
    box.appendChild(loading);
    box.scrollTop = box.scrollHeight;

    isReplying = true;
    updateAiStatus('busy');
    setTimeout(function(){ handleReply(text, loading); }, 150);
}

async function handleReply(text, loading){
    var local = localAction(text);
    if (local !== null){
        loading.remove();
        pushAi(local);
        isReplying = false;
        updateAiStatus();
        return;
    }

    if (AI_CONFIG.mode === 'on'){
        try {
            if (loading) loading.innerText = "联网搜索中...";
            var reply = await requestAI(text, false);
            loading.remove();
            pushAi(reply);
            isReplying = false;
            updateAiStatus();
            return;
        } catch (err) {
            console.warn('online AI failed:', err);
            if (loading) loading.innerText = "联网超时，正在转为离线回复...";
            await new Promise(function(resolve){ setTimeout(resolve, 800); });
            loading.remove();
        }
    }

    var fallback = localAI(text);
    pushAi(fallback);

    var note = document.createElement("div");
    note.className = "msg system";
    note.innerText = "💡 联网超时，以上为离线回复。可点击右上角「配置 AI」检查网络。";
    var box = $("chatBox");
    box.appendChild(note);
    box.scrollTop = box.scrollHeight;
    setTimeout(function(){ note.remove(); }, 8000);

    isReplying = false;
    updateAiStatus();
}

function saveChat(){ save("chat", chatHistory.slice(-50)); }
function clearChat(){
    chatHistory = [];
    pendingAction = null;
    localStorage.removeItem("chat");
    renderChat();
}

$('chatForm').addEventListener('submit', function(e){
    e.preventDefault();
    sendMsg();
});
$("chatInput").addEventListener('keydown', function(e){ if (e.key === 'Enter') e.preventDefault(); });
document.querySelector('.chips').addEventListener('click', function(e){
    var chip = e.target.closest('.chip');
    if (chip && chip.dataset.text) sendMsg(chip.dataset.text);
});

/* ===================== 本地 AI ===================== */
var pendingAction = null;

function localAction(text){
    var t = text.trim();
    var confirmed = handlePendingConfirm(t);
    if (confirmed !== null) return confirmed;

    // 优先处理考试意图
    var examSet = parseSetExam(t);
    if (examSet){
        var result = "已添加考试：\n";
        if (examSet.type || examSet.date){
            var examName = examSet.type || '考试';
            addExam(examName, examSet.date);
            if (examSet.type) result += "名称：" + examSet.type + "\n";
            if (examSet.date) result += "日期：" + examSet.date + "\n";

            var tasksToAdd = [];
            if (examName.indexOf('普通话') !== -1) {
                tasksToAdd = [
                    { name: '普通话发音练习', type: 'daily' },
                    { name: '普通话朗读练习', type: 'daily' },
                    { name: '普通话模拟测试', type: 'weekly', targetCount: 1 }
                ];
            } else {
                tasksToAdd = [
                    { name: examName + ' 基础复习', type: 'daily' },
                    { name: examName + ' 真题练习', type: 'weekly', targetCount: 1 }
                ];
            }

            var addedCount = 0;
            tasksToAdd.forEach(function(task) {
                if (!hasSameTask(task.name)) {
                    addTaskToList(task.name, task.type, task.targetCount || 1);
                    addedCount++;
                }
            });
            if (addedCount > 0) result += "已自动生成 " + addedCount + " 个备考任务";
            return result;
        }
        return "请告诉我考试名称和日期，例如：设置考试 四级 12月14日";
    }

    // 添加任务
    var addParsed = parseAddTask(t);
    if (addParsed){
        if (hasSameTask(addParsed.name)){
            pendingAction = { type: 'addTask', data: addParsed };
            return "已经有同样的任务【" + addParsed.name + "】了。\n\n确定还要添加吗？\n回复「是」确认添加，回复「否」取消。";
        }
        addTaskToList(addParsed.name, addParsed.type, addParsed.targetCount);
        var msg = "已添加任务：\n\n" + addParsed.name + "\n类型：" + TYPE_NAMES[addParsed.type];
        if (addParsed.targetCount > 1) msg += "\n目标：" + addParsed.targetCount + " 次";
        msg += "\n\n可以在「任务」中查看~";
        return msg;
    }

    // 删除任务
    var delName = parseDeleteTask(t);
    if (delName){
        var found = taskList.find(function(x){ return x.name.indexOf(delName) !== -1 || delName.indexOf(x.name) !== -1; });
        if (!found) return "没有找到包含【" + delName + "】的任务。";
        taskList = taskList.filter(function(x){ return x !== found; });
        save("task_v2", taskList);
        renderTask();
        loadCheck();
        return "已删除任务：【" + found.name + "】";
    }

    // 查任务
    if (isTaskQuery(t)){
        var todayTasks = taskList.filter(isRequiredTask);
        var undone = todayTasks.filter(function(x){ return !getTaskProgress(x).isComplete; });
        if (todayTasks.length === 0) return "今天没有必做任务哦，可以休息一下，或者加个新任务~";
        if (undone.length === 0) return "今日必做任务已经全部完成啦！记得去打卡~";
        var list = undone.map(function(x, i){
            return (i+1) + ". " + x.name + "【" + TYPE_NAMES[x.type] + "】";
        }).join("\n");
        return "今日还有 " + undone.length + " 个必做任务：\n\n" + list;
    }

    return null;
}

function isTaskQuery(text){
    return /任务|还有什么|剩下|没完成|未完成|哪些/.test(text) && /查|看|哪些|什么|多少|剩|还有/.test(text);
}

function parseAddTask(text){
    if (!/(添加|加|新增|新建|创建|记一下|记个)/.test(text)) return null;
    var t = text;
    t = t.replace(/帮我|请|麻烦你|麻烦|我要|我想|然后|好的|嗯|你能|能不能|可以/g, '');
    t = t.replace(/添加|新增|新建|创建|记一下|记个|加/g, '');

    var type = 'once';
    if (/每天|每日|天天/.test(t)) type = 'daily';
    else if (/每周|每星期|每礼拜/.test(t)) type = 'weekly';
    else if (/每月|每个月/.test(t)) type = 'monthly';

    t = t.replace(/单次|一次|每天|每日|天天|每周|每星期|每礼拜|每月|每个月/g, '');

    var countMatch = t.match(/(\d+)\s*次/);
    var targetCount = countMatch ? parseInt(countMatch[1]) : 1;
    if (type === 'once' || type === 'daily') targetCount = 1;
    t = t.replace(/(\d+)\s*次/g, '');

    t = t.replace(/一个|一项|一条/g, '');
    t = t.replace(/(?<!\d)个/g, '');
    t = t.replace(/的?任务$|的?计划$|吧$|了$|的$/g, '');
    t = t.replace(/[，,。！!？?、\s]+/g, ' ').trim();

    if (!t || t.length < 2) return null;
    if (t.length > 30) t = t.slice(0, 30);
    return { name: t, type: type, targetCount: targetCount };
}

function parseDeleteTask(text){
    if (!/(删除|删掉|移除|去掉|不要)/.test(text)) return null;
    var t = text.replace(/帮我|请|麻烦|删除|删掉|移除|去掉|不要|任务|吧|了|的/g, '').trim();
    return t || null;
}

function parseSetExam(text) {
    var result = { type: null, date: null };
    var now = new Date();
    var year = now.getFullYear();

    // 相对年份
    if (/前年/.test(text)) year = year - 2;
    else if (/去年/.test(text)) year = year - 1;
    else if (/明年/.test(text)) year = year + 1;
    else if (/后年/.test(text)) year = year + 2;
    else {
        var ym = text.match(/(\d+)\s*年后/);
        if (ym) year = year + parseInt(ym[1]);
    }
    var ey = text.match(/(\d{4})\s*[-\/年]/);
    if (ey) year = parseInt(ey[1]);

    // 月日
    var dm = text.match(/(\d{1,2})\s*[-\/月]\s*(\d{1,2})/);
    if (dm) {
        result.date = year + '-' + String(dm[1]).padStart(2, '0') + '-' + String(dm[2]).padStart(2, '0');
    }

    // 名称识别
    if (/(四|4)\s*级|CET[\s\-]?4/i.test(text)) {
        result.type = '四级';
    } else if (/(六|6)\s*级|CET[\s\-]?6/i.test(text)) {
        result.type = '六级';
    } else {
        var preset = ['小升初', '中考', '高考', '考研', '专升本', '普通话', '教师资格证'];
        for (var i = 0; i < preset.length; i++) {
            if (text.indexOf(preset[i]) !== -1) { result.type = preset[i]; break; }
        }
    }

    if (!result.type) {
        var match = text.match(/(?:报考|要考|考证|考)\s*([\u4e00-\u9fa5A-Za-z0-9]{2,10})/);
        if (match && match[1]) {
            var name = match[1].replace(/考试$/, '').replace(/^[的\s]+/, '');
            if (name && name !== '试' && name !== '完' && name !== '了') {
                result.type = name;
            }
        }
    }

    if (!result.type && !result.date) return null;
    return result;
}

function handlePendingConfirm(text){
    if (!pendingAction) return null;
    var t = text.trim();
    if (/^(是|是的|对|确定|确认|好|好的|yes|y|要|添加|加|ok)/i.test(t)){
        if (pendingAction.type === 'addTask'){
            var d = pendingAction.data;
            addTaskToList(d.name, d.type, d.targetCount);
            pendingAction = null;
            var msg = "已添加任务：\n\n" + d.name + "\n类型：" + TYPE_NAMES[d.type];
            if (d.targetCount > 1) msg += "\n目标：" + d.targetCount + " 次";
            return msg;
        }
    }
    if (/^(否|不|不要|取消|算了|no|n|别|不用)/i.test(t)){
        var name = pendingAction.data ? pendingAction.data.name : '';
        pendingAction = null;
        return "好的，已取消添加【" + name + "】。";
    }
    pendingAction = null;
    return null;
}

function recommendPomodoro(taskCount){
    if (taskCount >= 5){
        return "任务比较多，建议用【深度 50+10】番茄钟，每个任务用 1-2 个番茄；或者用【经典 25+5】分多轮完成。";
    } else if (taskCount >= 3){
        return "建议用【经典 25+5】番茄钟，每个任务专注 1 个番茄，中间休息 5 分钟。";
    } else if (taskCount >= 1){
        return "任务不多，建议用【短时 15+3】快速完成，保持节奏。";
    }
    return "";
}

function localAI(text){
    var t = text.trim();

    if (/^(你好|hi|hello|嗨|在吗|哈喽|hi~)/i.test(t) && t.length < 12){
        return "你好呀！我是你的学习规划助手。\n\n我可以帮你：\n· 加任务：\"帮我加个每天背50个单词的任务\"\n· 删任务：\"删除背单词\"\n· 设考试：\"我明年1月20号要考四级\"\n· 查任务：\"今天还有什么任务\"\n· 要建议：\"帮我安排今天\"\n\n也可以问我学习方法~";
    }

    if (/番茄钟|番茄|pomodoro|怎么专注/.test(t)){
        var todayTasksP = taskList.filter(isRequiredTask);
        var undoneP = todayTasksP.filter(function(x){ return !getTaskProgress(x).isComplete; });
        var rec = recommendPomodoro(undoneP.length);
        return "番茄钟小贴士：\n\n" + rec + "\n\n使用建议：\n· 一个番茄钟内专注一件事，别中途刷手机\n· 休息时起来走动，不要看屏幕\n· 今日已完成 " + getTodayPomodoroCount() + " 个番茄";
    }

    if (/安排|计划|怎么学|先做|优先|建议|该做/.test(t)){
        var todayTasksA = taskList.filter(isRequiredTask);
        var undoneA = todayTasksA.filter(function(x){ return !getTaskProgress(x).isComplete; });
        var day = calcCount();
        var dayInfo = (day !== null && day > 0) ? "距离【" + getExamLabel() + "】还有 " + day + " 天。" : "";
        if (undoneA.length === 0) return "今日必做任务都完成了！" + dayInfo + "建议复盘错题，或预习明天内容。";
        var priority = { daily: 1, weekly: 2, monthly: 2, once: 3 };
        var sorted = undoneA.slice().sort(function(a, b){
            return (priority[a.type] || 9) - (priority[b.type] || 9);
        });
        var listA = sorted.slice(0, 3).map(function(x, i){ return (i+1) + ". " + x.name; }).join("\n");
        var pomoTip = recommendPomodoro(undoneA.length);
        return "今日建议优先级：\n\n" + listA + "\n\n" + dayInfo + "\n" + pomoTip;
    }

    if (/焦虑|紧张|压力|害怕|担心|难受|烦/.test(t)){
        var day2 = calcCount();
        var dayInfo2 = (day2 !== null && day2 > 0) ? "距离考试还有 " + day2 + " 天，按自己的节奏来就好~" : "按自己的节奏来就好~";
        return "理解你的感受。\n\n几个小建议：\n1. 把大目标拆成今天能做的一小步\n2. 深呼吸 4-7-8：吸气4秒、屏息7秒、呼气8秒\n3. 完成一个小任务就去打卡，给自己正反馈\n\n" + dayInfo2;
    }

    if (/单词|背单词|英语单词/.test(t)){
        return "背单词小技巧：\n\n· 用艾宾浩斯遗忘曲线：当天、第2天、第4天、第7天各复习一次\n· 一次别背太多，50个左右分组记忆\n· 结合例句记忆，比死记硬背效果好\n· 善用碎片时间，比如通勤、排队\n\n建议配合【经典 25+5】番茄钟，每 25 分钟背一组。";
    }
    if (/数学|高数|做题|刷题/.test(t)){
        return "数学提分关键：\n\n· 错题本：按知识点归类\n· 每周重做一次错题，直到能独立讲清思路\n· 先做基础题打牢，再攻难题\n· 限时训练，模拟考场状态\n\n数学建议用【深度 50+10】番茄钟，适合需要长时专注的题目。";
    }
    if (/作文|写作/.test(t)){
        return "作文提升建议：\n\n· 积累素材：每天看1-2个优秀范文\n· 背诵好句好段\n· 每周写1-2篇\n· 建立自己的万能句库";
    }
    if (/记忆|背诵|记不住/.test(t)){
        return "记忆方法：\n\n· 间隔重复：分多次比一次背大量好\n· 主动回忆：合上书自己回想，比反复看效果好\n· 联想记忆：把新知识和已知的连起来\n· 睡眠充足，睡眠时大脑会整理记忆";
    }
    if (/打卡|坚持|习惯/.test(t)){
        return "坚持打卡的秘诀：\n\n· 固定时间地点，形成仪式感\n· 从最小任务开始（哪怕只学10分钟）\n· 完成后立刻打卡，给自己正反馈\n· 别断，断了就重新开始，不必自责";
    }
    if (/时间|拖延|懒|不想学|没动力/.test(t)){
        return "克服拖延：\n\n· 5分钟法则：告诉自己\"只学5分钟\"，往往就停不下来了\n· 把任务拆小：\"背50个单词\"太大会拖延，改成\"先背10个\"\n· 番茄工作法：25分钟专注+5分钟休息\n· 环境切换：换个地方学习，比如图书馆";
    }
    if (/休息|累|疲劳|困/.test(t)){
        return "学习也要劳逸结合：\n\n· 每学习45-50分钟休息5-10分钟\n· 休息时别刷手机，起来走动、喝水、看远处\n· 保证7-8小时睡眠\n· 每周留半天完全放松的时间";
    }
    if (/谢谢|感谢|thanks|thank you/i.test(t)){
        return "不客气！有需要随时找我，加油！";
    }

    return "我可以帮你：\n\n· 加任务：\"帮我加个每天背50个单词的任务\"\n· 删任务：\"删除背单词\"\n· 设考试：\"我明年1月20号要考四级\"\n· 查任务：\"今天还有什么任务\"\n· 要建议：\"帮我安排今天\"\n· 番茄钟：\"推荐番茄钟\"\n\n也可以问我学习方法哦~";
}

/* ===================== 任务类型联动 ===================== */
$("taskType").onchange = function(){
    var t = this.value;
    $("taskCountWrap").style.display = (t === 'weekly' || t === 'monthly') ? 'flex' : 'none';
};

/* ===================== 精力建议 ===================== */
function updateEnergyTip(){
    var el = $('energyTip');
    if (!el) return;
    var undone = taskList.filter(function(t){ return isRequiredTask(t) && !getTaskProgress(t).isComplete; });
    if (!undone.length){
        el.style.display = 'none';
        return;
    }
    var h = undone.filter(function(t){ return t.energy === 'high'; }).length;
    var m = undone.filter(function(t){ return t.energy === 'mid'; }).length;
    var l = undone.filter(function(t){ return t.energy === 'low'; }).length;
    var tip;
    if (h >= 2) tip = '今天还有 ' + h + ' 个高耗能必做任务：状态好的时候先攻克它们，疲惫时穿插轻松任务恢复节奏。';
    else if (h === 1 && m >= 2) tip = '今天有 1 个高耗能必做任务，建议放在状态最好的时段，其余时间处理中等任务。';
    else if (l > 0 && h === 0) tip = '今天都是轻松任务，适合快速推进，保持节奏。';
    else tip = '今日精力分布（必做）：高耗能 ' + h + ' · 中等 ' + m + ' · 轻松 ' + l;
    el.style.display = 'block';
    el.innerText = tip;
}

/* ===================== 周期任务进度提示 ===================== */
function updatePeriodicTip(){
    var box = $('periodicTip');
    if (!box) return;
    var weekly = taskList.filter(function(t){
        return t.type === 'weekly' && !getTaskProgress(t).isComplete;
    });
    var monthly = taskList.filter(function(t){
        return t.type === 'monthly' && !getTaskProgress(t).isComplete;
    });
    if (!weekly.length && !monthly.length){
        box.style.display = 'none';
        return;
    }
    var lines = [];
    if (weekly.length){
        var parts = weekly.map(function(t){
            var p = getTaskProgress(t);
            return t.name + ' ' + p.current + '/' + p.target;
        });
        lines.push('本周：' + parts.join('　·　'));
    }
    if (monthly.length){
        var parts2 = monthly.map(function(t){
            var p = getTaskProgress(t);
            return t.name + ' ' + p.current + '/' + p.target;
        });
        lines.push('本月：' + parts2.join('　·　'));
    }
    box.style.display = 'block';
    box.innerHTML = lines.join('<br>');
}

/* ===================== 目标折旧衰减 ===================== */
var goals = load('goals_v1', []);

function dayDiff(a, b){
    var da = new Date(a + 'T00:00:00');
    var db = new Date(b + 'T00:00:00');
    return Math.round((db - da) / 86400000);
}
function isAnyTaskDoneOn(date){
    return taskList.some(function(t){
        if (t.type === 'once') return false;
        return (t.completedDates || []).indexOf(date) !== -1;
    });
}
function applyGoalDecay(){
    var today = getToday();
    var changed = false;
    goals.forEach(function(g){
        var last = g.lastProgressDate || today;
        if (last >= today) return;
        var d = new Date(last + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        while (formatDate(d) <= today){
            if (!isAnyTaskDoneOn(formatDate(d))){
                g.progress = Math.max(0, g.progress - 2);
            }
            d.setDate(d.getDate() + 1);
        }
        g.lastProgressDate = today;
        changed = true;
    });
    if (changed) save('goals_v1', goals);
}
function boostGoals(){
    goals.forEach(function(g){
        g.progress = Math.min(100, g.progress + 2);
        g.lastProgressDate = getToday();
    });
    save('goals_v1', goals);
}
function renderGoals(){
    var dom = $('goalList');
    dom.innerHTML = '';
    if (!goals.length){
        var li = document.createElement('li');
        li.className = 'empty-tip';
        li.innerText = '还没有目标，先添加一个吧';
        li.style.listStyle = 'none';
        dom.appendChild(li);
        return;
    }
    var today = getToday();
    goals.forEach(function(g, i){
        var li = document.createElement('li');
        li.className = 'goal-item';
        var top = document.createElement('div');
        top.className = 'goal-top';
        var name = document.createElement('span');
        name.className = 'goal-name';
        name.innerText = g.name;
        var pct = document.createElement('span');
        pct.className = 'goal-pct';
        pct.innerText = g.progress + '%';
        var del = document.createElement('button');
        del.className = 'goal-del';
        del.innerText = '删除';
        del.onclick = function(){
            if (!confirm('确定删除目标【' + g.name + '】吗？')) return;
            goals.splice(i, 1);
            save('goals_v1', goals);
            renderGoals();
        };
        top.appendChild(name); top.appendChild(pct); top.appendChild(del);
        var bar = document.createElement('div');
        bar.className = 'progress';
        var fill = document.createElement('i');
        fill.style.width = g.progress + '%';
        bar.appendChild(fill);
        var meta = document.createElement('div');
        var days = dayDiff(g.lastProgressDate || today, today);
        if (days > 0){
            meta.className = 'goal-meta decay';
            meta.innerText = '已连续 ' + days + ' 天未推进，进度每天衰减 2% · 完成任意任务可回升';
        } else {
            meta.className = 'goal-meta';
            meta.innerText = '今天已有推进，保持节奏';
        }
        li.appendChild(top); li.appendChild(bar); li.appendChild(meta);
        dom.appendChild(li);
    });
}
$('goalAddBtn').addEventListener('click', function(){
    var v = $('goalInput').value.trim();
    if (!v) return;
    goals.push({ id: uid(), name: v, progress: 30, lastProgressDate: getToday() });
    save('goals_v1', goals);
    $('goalInput').value = '';
    renderGoals();
    toast('目标已添加，初始进度 30%');
});
$('goalInput').addEventListener('keydown', function(e){ if (e.key === 'Enter') $('goalAddBtn').click(); });

/* ===================== 四层拆解器 ===================== */
var dec = load('decompose_v1', null);
var decExpandedMonth = null;
var decExpandedWeek = null;

function decMonthText(goal, idx, total){
    var r = idx / Math.max(1, total - 1);
    var phase = r < 0.35 ? '入门 · 打基础' : r < 0.7 ? '系统 · 强化提升' : '冲刺 · 巩固复习';
    return '【第' + (idx + 1) + '月】' + phase + '：推进「' + goal + '」阶段任务';
}
function decWeekText(goal, m, w){
    return '第' + (m * 4 + w + 1) + '周：完成本周「' + goal + '」学习任务（约 4-6 小时）';
}
function decDayText(goal, m, w, d){
    var act = ['预习与阅读', '练习与巩固', '复习与输出'][d % 3];
    return '第' + (w * 7 + d + 1) + '天：' + act + ' ——「' + goal + '」当日小条目';
}
function generateDecompose(goal, n){
    var months = [];
    for (var i = 0; i < n; i++){
        var mObj = { text: decMonthText(goal, i, n), weeks: [] };
        for (var w = 0; w < 4; w++){
            var wObj = { text: decWeekText(goal, i, w), days: [] };
            for (var d = 0; d < 7; d++){
                wObj.days.push({ text: decDayText(goal, i, w, d) });
            }
            mObj.weeks.push(wObj);
        }
        months.push(mObj);
    }
    return { goalName: goal, months: months };
}
function addDecToTasks(text){
    if (!text.trim()) return;
    if (hasSameTask(text.trim())){ toast('该任务已存在'); return; }
    addTaskToList(text.trim(), 'once', 1);
    toast('已加入任务清单');
}
function renderDecTree(){
    var dom = $('decTree');
    dom.innerHTML = '';
    if (!dec){
        var p = document.createElement('p');
        p.className = 'dec-empty';
        p.innerText = '输入一个总目标（如：一年内掌握UG软件），自动拆解成 年度 → 月度 → 周 → 日 四层计划，可自由修改，或一键加入任务清单。';
        dom.appendChild(p);
        return;
    }

    var yl = document.createElement('div');
    yl.className = 'dec-level-label';
    yl.innerText = '年度总目标';
    dom.appendChild(yl);
    var ynode = document.createElement('div');
    ynode.className = 'dec-node level-month';
    var cbY = document.createElement('input');
    cbY.type = 'checkbox';
    var yInput = document.createElement('input');
    yInput.className = 'dec-text';
    yInput.value = dec.goalName;
    yInput.addEventListener('change', function(){ dec.goalName = this.value.trim(); save('decompose_v1', dec); });
    var yAdd = document.createElement('button');
    yAdd.className = 'dec-add';
    yAdd.innerText = '加入任务';
    yAdd.onclick = function(){ addDecToTasks(dec.goalName); };
    ynode.appendChild(cbY); ynode.appendChild(yInput); ynode.appendChild(yAdd);
    dom.appendChild(ynode);

    var ml = document.createElement('div');
    ml.className = 'dec-level-label';
    ml.innerText = '月度计划（' + dec.months.length + ' 个月）';
    dom.appendChild(ml);
    var mWrap = document.createElement('div');
    dec.months.forEach(function(m, mi){
        var node = document.createElement('div');
        node.className = 'dec-node level-month';
        var tog = document.createElement('button');
        tog.className = 'dec-toggle';
        tog.innerText = decExpandedMonth === mi ? '▾' : '▸';
        tog.onclick = function(){
            decExpandedMonth = decExpandedMonth === mi ? null : mi;
            decExpandedWeek = null;
            renderDecTree();
        };
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        var inp = document.createElement('input');
        inp.className = 'dec-text';
        inp.value = m.text;
        inp.addEventListener('change', function(){ m.text = this.value; save('decompose_v1', dec); });
        var add = document.createElement('button');
        add.className = 'dec-add';
        add.innerText = '加入任务';
        add.onclick = function(){ addDecToTasks(m.text); };
        node.appendChild(tog); node.appendChild(cb); node.appendChild(inp); node.appendChild(add);
        mWrap.appendChild(node);

        if (decExpandedMonth === mi){
            var ch = document.createElement('div');
            ch.className = 'dec-children';
            m.weeks.forEach(function(wk, wi){
                var wnode = document.createElement('div');
                wnode.className = 'dec-node';
                var wtog = document.createElement('button');
                wtog.className = 'dec-toggle';
                wtog.innerText = decExpandedWeek === wi ? '▾' : '▸';
                wtog.onclick = function(){
                    decExpandedWeek = decExpandedWeek === wi ? null : wi;
                    renderDecTree();
                };
                var wcb = document.createElement('input');
                wcb.type = 'checkbox';
                var winp = document.createElement('input');
                winp.className = 'dec-text';
                winp.value = wk.text;
                winp.addEventListener('change', function(){ wk.text = this.value; save('decompose_v1', dec); });
                var wadd = document.createElement('button');
                wadd.className = 'dec-add';
                wadd.innerText = '加入任务';
                wadd.onclick = function(){ addDecToTasks(wk.text); };
                wnode.appendChild(wtog); wnode.appendChild(wcb); wnode.appendChild(winp); wnode.appendChild(wadd);
                ch.appendChild(wnode);
                if (decExpandedWeek === wi){
                    var dch = document.createElement('div');
                    dch.className = 'dec-children';
                    wk.days.forEach(function(dy){
                        var dnode = document.createElement('div');
                        dnode.className = 'dec-node';
                        var dcb = document.createElement('input');
                        dcb.type = 'checkbox';
                        var dinp = document.createElement('input');
                        dinp.className = 'dec-text';
                        dinp.value = dy.text;
                        dinp.addEventListener('change', function(){ dy.text = this.value; save('decompose_v1', dec); });
                        var dadd = document.createElement('button');
                        dadd.className = 'dec-add';
                        dadd.innerText = '加入任务';
                        dadd.onclick = function(){ addDecToTasks(dy.text); };
                        dnode.appendChild(dcb); dnode.appendChild(dinp); dnode.appendChild(dadd);
                        dch.appendChild(dnode);
                    });
                    ch.appendChild(dch);
                }
            });
            mWrap.appendChild(ch);
        }
    });
    dom.appendChild(mWrap);

    var batch = document.createElement('button');
    batch.className = 'btn-ghost btn-sm dec-batch';
    batch.innerText = '将勾选项加入任务清单';
    batch.onclick = function(){
        var n = 0;
        dom.querySelectorAll('.dec-node input[type="checkbox"]:checked').forEach(function(cb){
            var inp = cb.parentElement.querySelector('.dec-text');
            if (inp && inp.value.trim() && !hasSameTask(inp.value.trim())){
                addTaskToList(inp.value.trim(), 'once', 1);
                n++;
            }
        });
        toast(n ? '已加入 ' + n + ' 项任务' : '没有新任务可加入（可能已存在）');
    };
    dom.appendChild(batch);
}
$('decBtn').addEventListener('click', function(){
    var goal = $('decGoal').value.trim();
    if (!goal){ alert('请输入总目标'); return; }
    var n = parseInt($('decMonths').value) || 12;
    dec = generateDecompose(goal, n);
    decExpandedMonth = null;
    decExpandedWeek = null;
    save('decompose_v1', dec);
    renderDecTree();
    toast('已生成 ' + n + ' 个月的拆解计划');
});
$('decGoal').addEventListener('keydown', function(e){ if (e.key === 'Enter') $('decBtn').click(); });

/* ===================== 周对照 ===================== */
function getWeekly(){
    var wp = load('weeklyPlan_v1', { weekStart: '', planned: [], actual: [] });
    var ws = getWeekStart();
    if (wp.weekStart !== ws){
        wp = { weekStart: ws, planned: [], actual: [] };
        save('weeklyPlan_v1', wp);
    }
    return wp;
}
function saveWeekly(wp){ save('weeklyPlan_v1', wp); }
function isPlannedDone(p){
    var wp = getWeekly();
    return wp.actual.some(function(a){ return a.indexOf(p) !== -1 || p.indexOf(a) !== -1; });
}
function renderPlanList(){
    var wp = getWeekly();
    var dom = $('planList');
    dom.innerHTML = '';
    if (!wp.planned.length){
        var li = document.createElement('li');
        li.className = 'empty-tip';
        li.innerText = '还没有计划';
        dom.appendChild(li);
        return;
    }
    wp.planned.forEach(function(t, i){
        var li = document.createElement('li');
        if (isPlannedDone(t)) li.className = 'done';
        var span = document.createElement('span');
        span.innerText = t;
        var del = document.createElement('button');
        del.className = 'week-del';
        del.innerText = '×';
        del.onclick = function(){
            wp.planned.splice(i, 1);
            saveWeekly(wp);
            renderWeekly();
        };
        li.appendChild(span); li.appendChild(del);
        dom.appendChild(li);
    });
}
function renderActualList(){
    var wp = getWeekly();
    var dom = $('actualList');
    dom.innerHTML = '';
    if (!wp.actual.length){
        var li = document.createElement('li');
        li.className = 'empty-tip';
        li.innerText = '还没有记录';
        dom.appendChild(li);
        return;
    }
    wp.actual.forEach(function(t, i){
        var li = document.createElement('li');
        var span = document.createElement('span');
        span.innerText = t;
        var del = document.createElement('button');
        del.className = 'week-del';
        del.innerText = '×';
        del.onclick = function(){
            wp.actual.splice(i, 1);
            saveWeekly(wp);
            renderWeekly();
        };
        li.appendChild(span); li.appendChild(del);
        dom.appendChild(li);
    });
}
function updateWeeklySummary(){
    var wp = getWeekly();
    var el = $('weeklySummary');
    if (!wp.planned.length){
        el.innerHTML = '先添加几条「本周计划」，再记录「实际完成」，系统会自动计算完成率并给出下周建议。';
        return;
    }
    var done = wp.planned.filter(isPlannedDone).length;
    var rate = Math.round(done / wp.planned.length * 100);
    var tip;
    if (rate >= 90) tip = '节奏把握得很好，下周可以适当增加 10% 左右的任务量。';
    else if (rate >= 70) tip = '基本按计划执行，下周可以保持或微调。';
    else if (rate >= 40) tip = '高估了任务量，下周建议减少两成左右。';
    else tip = '计划与现实差距较大，建议重新评估任务量，或把大任务拆小再排。';
    el.innerHTML = '本周计划完成率 <b>' + rate + '%</b>（' + done + '/' + wp.planned.length + '）· ' + tip;
}
function renderWeekly(){ renderPlanList(); renderActualList(); updateWeeklySummary(); }
$('planAddBtn').addEventListener('click', function(){
    var wp = getWeekly();
    var v = $('planInput').value.trim();
    if (!v) return;
    wp.planned.push(v);
    saveWeekly(wp);
    $('planInput').value = '';
    renderWeekly();
});
$('planInput').addEventListener('keydown', function(e){ if (e.key === 'Enter') $('planAddBtn').click(); });
$('actualAddBtn').addEventListener('click', function(){
    var wp = getWeekly();
    var v = $('actualInput').value.trim();
    if (!v) return;
    wp.actual.push(v);
    saveWeekly(wp);
    $('actualInput').value = '';
    renderWeekly();
});
$('actualInput').addEventListener('keydown', function(e){ if (e.key === 'Enter') $('actualAddBtn').click(); });

/* ===================== 时间胶囊 ===================== */
var capsules = load('capsules_v1', []);
function renderCapsules(){
    var dom = $('capsuleList');
    dom.innerHTML = '';
    if (!capsules.length){
        var li = document.createElement('li');
        li.className = 'empty-tip';
        li.innerText = '写一封信给未来的自己，到日子自动解锁。';
        li.style.listStyle = 'none';
        dom.appendChild(li);
        return;
    }
    var today = getToday();
    capsules.slice().sort(function(a,b){ return a.unlockDate.localeCompare(b.unlockDate); }).forEach(function(c){
        var locked = c.unlockDate > today;
        var li = document.createElement('li');
        li.className = 'capsule-item' + (locked ? ' locked' : '');
        var head = document.createElement('div');
        head.className = 'capsule-head';
        var title = document.createElement('div');
        title.className = 'capsule-title';
        title.innerText = c.title || '未命名';
        var del = document.createElement('button');
        del.className = 'capsule-del';
        del.innerText = '删除';
        del.onclick = function(){
            if (!confirm('确定删除这封信吗？')) return;
            capsules = capsules.filter(function(x){ return x.id !== c.id; });
            save('capsules_v1', capsules);
            renderCapsules();
        };
        head.appendChild(title); head.appendChild(del);
        li.appendChild(head);
        var date = document.createElement('div');
        date.className = 'capsule-date';
        date.innerText = locked ? '封存至 ' + c.unlockDate + ' 自动解锁' : '已于 ' + c.unlockDate + ' 解锁';
        li.appendChild(date);
        if (locked){
            var tip = document.createElement('div');
            tip.className = 'capsule-lock-tip';
            tip.innerText = '· · · 内容已加密，到日子才能打开 · · ·';
            li.appendChild(tip);
        } else {
            var body = document.createElement('div');
            body.className = 'capsule-body';
            body.innerText = c.content || '';
            li.appendChild(body);
        }
        dom.appendChild(li);
    });
}
$('capsuleNewBtn').addEventListener('click', function(){
    $('capsuleTitle').value = '';
    $('capsuleContent').value = '';
    $('capsuleDate').value = '';
    $('capsuleListView').style.display = 'none';
    $('capsuleEditView').style.display = 'block';
});
$('capsuleSaveBtn').addEventListener('click', function(){
    var title = $('capsuleTitle').value.trim() || '写给未来的信';
    var content = $('capsuleContent').value.trim();
    var date = $('capsuleDate').value;
    if (!content){ alert('写点内容再封存吧'); return; }
    if (!date){ alert('请选择解锁日期'); return; }
    if (date <= getToday()){ alert('解锁日期需要晚于今天'); return; }
    capsules.push({ id: uid(), title: title, content: content, unlockDate: date });
    save('capsules_v1', capsules);
    $('capsuleEditView').style.display = 'none';
    $('capsuleListView').style.display = 'block';
    renderCapsules();
    toast('已封存，' + date + ' 自动解锁');
});
$('capsuleCancelBtn').addEventListener('click', function(){
    $('capsuleEditView').style.display = 'none';
    $('capsuleListView').style.display = 'block';
});

/* ===================== 阻力日志 ===================== */
var obstacles = load('obstacles_v1', []);
var OBSTACLE_ADVICE = {
    '偷懒': '把任务拆得更小，用「只学5分钟」先启动',
    '知识点太难': '先补前置基础，把难题拆成小步骤逐个攻克',
    '身体疲惫': '保证睡眠，疲惫时安排轻松任务恢复状态',
    '外界干扰': '固定学习时段，把手机放远一点'
};
function updateObstacleStats(){
    var el = $('obstacleStats');
    if (!obstacles.length){ el.innerHTML = ''; return; }
    var counts = {};
    obstacles.forEach(function(o){ counts[o.reason] = (counts[o.reason] || 0) + 1; });
    var total = obstacles.length;
    var sorted = Object.keys(counts).sort(function(a,b){ return counts[b] - counts[a]; });
    var top = sorted[0];
    var pct = Math.round(counts[top] / total * 100);
    var advice = OBSTACLE_ADVICE[top] || '记录具体原因，复盘时再调整安排';
    el.innerHTML = '最常阻碍你的是「<b>' + top + '</b>」（' + counts[top] + ' 次，占 ' + pct + '%）。<br>建议：' + advice;
}
function renderObstacles(){
    var dom = $('obstacleList');
    dom.innerHTML = '';
    if (!obstacles.length){
        var li = document.createElement('li');
        li.className = 'empty-tip';
        li.innerText = '没完成任务时，记录一下原因，系统会帮你找到最大的阻力。';
        li.style.listStyle = 'none';
        dom.appendChild(li);
    } else {
        obstacles.slice().reverse().forEach(function(o){
            var li = document.createElement('li');
            var s1 = document.createElement('span');
            s1.innerText = o.date + ' · ' + o.reason;
            var del = document.createElement('button');
            del.className = 'week-del';
            del.innerText = '×';
            del.onclick = function(){
                obstacles = obstacles.filter(function(x){ return x.id !== o.id; });
                save('obstacles_v1', obstacles);
                renderObstacles();
            };
            li.appendChild(s1); li.appendChild(del);
            dom.appendChild(li);
        });
    }
    updateObstacleStats();
}

$('obstacleReason').addEventListener('change', function(){
    if (this.value === '其他') {
        $('customObstacleReason').style.display = 'block';
    } else {
        $('customObstacleReason').style.display = 'none';
        $('customObstacleReason').value = '';
    }
});

$('obstacleAddBtn').addEventListener('click', function(){
    var reason = $('obstacleReason').value;
    if (reason === '其他') {
        var custom = $('customObstacleReason').value.trim();
        if (!custom) { alert('请填写具体的阻力原因'); return; }
        reason = custom;
    }
    obstacles.push({ id: uid(), date: getToday(), reason: reason });
    save('obstacles_v1', obstacles);
    $('customObstacleReason').value = '';
    renderObstacles();
    toast('已记录');
});

/* ===================== 里程碑相册 ===================== */
var milestones = load('milestones_v1', []);
function readImageFile(file, cb){
    var reader = new FileReader();
    reader.onload = function(){
        var img = new Image();
        img.onload = function(){
            var max = 800;
            var scale = Math.min(1, max / Math.max(img.width, img.height));
            var c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.width * scale));
            c.height = Math.max(1, Math.round(img.height * scale));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            cb(c.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = function(){ alert('图片读取失败'); };
        img.src = reader.result;
    };
    reader.onerror = function(){ alert('文件读取失败'); };
    reader.readAsDataURL(file);
}
function renderMilestones(){
    var dom = $('msTimeline');
    dom.innerHTML = '';
    if (!milestones.length){
        var p = document.createElement('p');
        p.className = 'dec-empty';
        p.innerText = '达成大目标里程碑时，上传一张照片，把成长做成一本故事手册。';
        dom.appendChild(p);
        return;
    }
    milestones.slice().sort(function(a,b){ return b.date.localeCompare(a.date); }).forEach(function(m){
        var item = document.createElement('div');
        item.className = 'ms-item';
        var img = document.createElement('img');
        img.src = m.image;
        img.alt = m.title;
        var body = document.createElement('div');
        body.className = 'ms-body';
        var t = document.createElement('div');
        t.className = 'ms-title';
        t.innerText = m.title;
        var d = document.createElement('div');
        d.className = 'ms-date';
        d.innerText = m.date;
        var del = document.createElement('button');
        del.className = 'ms-del';
        del.innerText = '删除';
        del.onclick = function(){
            if (!confirm('确定删除这个里程碑吗？')) return;
            milestones = milestones.filter(function(x){ return x.id !== m.id; });
            save('milestones_v1', milestones);
            renderMilestones();
        };
        body.appendChild(t);
        if (m.note){
            var n = document.createElement('div');
            n.className = 'ms-note';
            n.innerText = m.note;
            body.appendChild(n);
        }
        body.appendChild(d);
        body.appendChild(del);
        item.appendChild(img);
        item.appendChild(body);
        dom.appendChild(item);
    });
}
$('msNewBtn').addEventListener('click', function(){
    $('msTitle').value = '';
    $('msFile').value = '';
    $('msNote').value = '';
    $('milestoneForm').style.display = 'block';
});
$('msCancelBtn').addEventListener('click', function(){ $('milestoneForm').style.display = 'none'; });
$('msSaveBtn').addEventListener('click', function(){
    var title = $('msTitle').value.trim();
    var file = $('msFile').files[0];
    var note = $('msNote').value.trim();
    if (!title || !file){ alert('请填写名称并选择一张图片'); return; }
    if (!/^image\//.test(file.type)){ alert('请选择图片文件'); return; }
    readImageFile(file, function(dataUrl){
        milestones.push({ id: uid(), title: title, date: getToday(), image: dataUrl, note: note });
        try {
            save('milestones_v1', milestones);
        } catch(e){
            milestones.pop();
            alert('图片太大，本地存储空间不足，请换一张更小的图片。');
            return;
        }
        $('milestoneForm').style.display = 'none';
        renderMilestones();
        toast('里程碑已保存（仅存本机浏览器）');
    });
});

/* ===================== 资源仓库 ===================== */
var resources = load('resources_v1', []);
function renderResources(){
    var dom = $('resList');
    dom.innerHTML = '';
    if (!resources.length){
        var li = document.createElement('li');
        li.className = 'empty-tip';
        li.innerText = '存放笔记、摘抄和学习链接，让资料和任务在一起。';
        li.style.listStyle = 'none';
        dom.appendChild(li);
        return;
    }
    resources.slice().reverse().forEach(function(r){
        var item = document.createElement('li');
        item.className = 'res-item';
        var head = document.createElement('div');
        head.className = 'res-head';
        var t = document.createElement('span');
        t.className = 'res-title';
        t.innerText = r.title;
        var ty = document.createElement('span');
        ty.className = 'res-type ' + r.type;
        ty.innerText = r.type === 'link' ? '链接' : '笔记';
        var del = document.createElement('button');
        del.className = 'res-del';
        del.innerText = '删除';
        del.onclick = function(){
            resources = resources.filter(function(x){ return x.id !== r.id; });
            save('resources_v1', resources);
            renderResources();
        };
        head.appendChild(t); head.appendChild(ty); head.appendChild(del);
        item.appendChild(head);
        if (r.type === 'link'){
            var a = document.createElement('a');
            a.className = 'res-link';
            a.href = r.content;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.innerText = r.content;
            item.appendChild(a);
        } else {
            var c = document.createElement('div');
            c.className = 'res-content';
            c.innerText = r.content;
            item.appendChild(c);
        }
        var meta = document.createElement('div');
        meta.className = 'res-meta';
        meta.innerText = r.createdAt;
        item.appendChild(meta);
        dom.appendChild(item);
    });
}
$('resAddBtn').addEventListener('click', function(){
    var title = $('resTitle').value.trim();
    var type = $('resType').value;
    var content = $('resContent').value.trim();
    if (!title || !content){
        alert(type === 'link' ? '请填写资料名和链接地址' : '请填写资料名和内容');
        return;
    }
    if (type === 'link' && !/^https?:\/\//i.test(content)){
        alert('链接地址需要以 http:// 或 https:// 开头');
        return;
    }
    resources.push({ id: uid(), title: title, type: type, content: content, createdAt: formatDate(new Date()) });
    save('resources_v1', resources);
    $('resTitle').value = '';
    $('resContent').value = '';
    renderResources();
    toast('资料已保存');
});
$('resType').addEventListener('change', function(){
    $('resContent').placeholder = this.value === 'link' ? '链接地址（https://…）' : '笔记内容，或摘抄文字';
});

/* ===================== 考试备考建议 ===================== */
function examRelatedTasks(){
    var label = getExamLabel();
    var kw = (label === '考试' || !label) ? null : label;
    return taskList.filter(function(t){ return kw && t.name.indexOf(kw) !== -1; });
}
function updateExamAdvice(){
    var box = $('examAdvice');
    var body = $('adviceBody');
    if (!box || !body) return;
    var day = calcCount();
    if (day === null){
        box.style.display = 'none';
        return;
    }
    box.style.display = 'block';
    var outAi = $('adviceAiResult');
    if (outAi) outAi.innerHTML = '';
    var label = getExamLabel();
    var lines = [];
    var phase;
    if (day > 120){ phase = '打基础期'; lines.push('时间充裕，建议每天投入 1-2 小时打基础，先把「' + label + '」的知识点整体过一遍，理解优先于刷题。'); }
    else if (day > 60){ phase = '系统学习期'; lines.push('建议每天 2-3 小时进入系统学习，按章节推进并配套练习，每周末做一次阶段性小结。'); }
    else if (day > 30){ phase = '强化提升期'; lines.push('进入强化期，建议每天 3-4 小时：真题模拟 + 错题整理，把高频考点逐项拿下。'); }
    else if (day > 7){ phase = '冲刺期'; lines.push('只剩不到一个月，每天 4-5 小时聚焦薄弱环节，做限时模拟训练，稳住心态。'); }
    else if (day > 0){ phase = '考前冲刺'; lines.push('临考阶段：回归错题和笔记，不再学新内容；保证睡眠、调整作息、保持手感。'); }
    else if (day === 0){ phase = '考试日'; lines.push('今天就是考试日：放平心态，检查证件和文具，相信自己平时的积累。'); }
    else { phase = '已结束'; lines.push('考试已结束，花点时间复盘：哪些准备有效、哪些环节可以改进，为下一场做准备。'); }

    var rel = examRelatedTasks();
    var undoneRel = rel.filter(function(t){ return !getTaskProgress(t).isComplete; });
    if (undoneRel.length > 0){
        lines.push('有 ' + undoneRel.length + ' 个与「' + label + '」相关的任务还没完成（' + undoneRel.map(function(t){ return t.name; }).slice(0,3).join('、') + '），建议优先安排。');
    } else if (rel.length > 0){
        lines.push('与「' + label + '」相关的任务都已完成，继续保持节奏。');
    }
    var todayReq = taskList.filter(isRequiredTask);
    var done = todayReq.filter(function(t){ return getTaskProgress(t).isComplete; }).length;
    if (todayReq.length > 0 && done < todayReq.length){
        lines.push('今日还有 ' + (todayReq.length - done) + ' 个必做任务未完成，先把今天的学习收尾，再考虑加量。');
    }
    var pomo = getTodayPomodoroCount();
    if (day > 0 && pomo > 0){
        var target = Math.min(8, Math.max(2, Math.round(day / 30) + 2));
        lines.push('今日已专注 ' + pomo + ' 个番茄钟；结合剩余 ' + day + ' 天，建议每天固定 ' + target + ' 个番茄钟左右。');
    }
    body.innerHTML = '<div class="advice-phase">' + phase + ' · 距「' + label + '」' + (day > 0 ? day + ' 天' : day === 0 ? '（今天）' : '已结束') + '</div>' + lines.map(function(l){ return '<p>' + l + '</p>'; }).join('');
}
$('adviceAiBtn').addEventListener('click', async function(){
    var day = calcCount();
    if (day === null){ toast('请先设置考试日期'); return; }
    var btn = this;
    var out = $('adviceAiResult');
    var label = getExamLabel();
    btn.disabled = true;
    btn.innerText = '生成中…';
    out.innerHTML = '<p class="advice-loading">AI 正在结合你的任务与目标生成建议…</p>';
    try {
        var text = '请针对目标考试「' + label + '」（还有 ' + day + ' 天），结合我当前的任务与目标，给出 3-5 条具体的每日备考建议。要求：分点列出、可执行、按优先级排序，不要客套话。';
        var reply = await requestAI(text, false);
        out.innerHTML = '<p class="advice-loading">AI 备考建议：</p>' + reply.split('\n').filter(function(l){ return l.trim(); }).map(function(l){ return '<p>' + l.replace(/^[-*\d.、\s]+/, '') + '</p>'; }).join('');
    } catch(e){
        out.innerHTML = '<p class="advice-err">AI 请求失败：' + e.message + '。可检查右上角「配置 AI」后重试。</p>';
    }
    btn.disabled = false;
    btn.innerText = '让 AI 写详细建议';
});

/* ===================== 日历（完整模块） ===================== */
var calYear = new Date().getFullYear();
var calMonth = new Date().getMonth();
var calSelectedDate = null;

function getMonthDays(y, m){
    return new Date(y, m + 1, 0).getDate();
}
function getFirstWeekday(y, m){
    var d = new Date(y, m, 1).getDay();
    return d === 0 ? 6 : d - 1;
}
function collectDayMarks(){
    var marks = {};
    exams.forEach(function(e){
        if (!marks[e.date]) marks[e.date] = { exam:[], task:false, pomo:0, scheduled:[] };
        marks[e.date].exam.push(e.name);
    });
    taskList.forEach(function(t){
        if (t.scheduledDate){
            if (!marks[t.scheduledDate]) marks[t.scheduledDate] = { exam:[], task:false, pomo:0, scheduled:[] };
            marks[t.scheduledDate].scheduled.push(t.name);
            return;
        }
        if (t.type === 'once') return;
        (t.completedDates || []).forEach(function(d){
            if (!marks[d]) marks[d] = { exam:[], task:false, pomo:0, scheduled:[] };
            marks[d].task = true;
        });
    });
    load('checkHistory', []).forEach(function(d){
        if (!marks[d]) marks[d] = { exam:[], task:false, pomo:0, scheduled:[] };
        marks[d].task = true;
    });
    var pr = load('pomodoroRecords', {});
    Object.keys(pr).forEach(function(d){
        if (!marks[d]) marks[d] = { exam:[], task:false, pomo:0, scheduled:[] };
        marks[d].pomo = pr[d];
    });
    return marks;
}
function renderCalendar(){
    var labelEl = document.getElementById('calMonthLabel');
    var gridEl = document.getElementById('calGrid');
    if (!labelEl || !gridEl) return;

    labelEl.innerText = calYear + ' 年 ' + (calMonth + 1) + ' 月';
    gridEl.innerHTML = '';

    ['一','二','三','四','五','六','日'].forEach(function(w){
        var el = document.createElement('div');
        el.className = 'calendar-weekday';
        el.innerText = w;
        gridEl.appendChild(el);
    });

    var firstWeekday = getFirstWeekday(calYear, calMonth);
    var days = getMonthDays(calYear, calMonth);
    var marks = collectDayMarks();
    var todayStr = getToday();

    for (var i = 0; i < firstWeekday; i++){
        var empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        gridEl.appendChild(empty);
    }

    for (var d = 1; d <= days; d++){
        (function(dayNum){
            var dateStr = calYear + '-' +
                String(calMonth + 1).padStart(2, '0') + '-' +
                String(dayNum).padStart(2, '0');
            var cell = document.createElement('div');
            cell.className = 'calendar-day';
            if (dateStr === todayStr) cell.classList.add('today');
            if (dateStr === calSelectedDate) cell.classList.add('selected');

            var num = document.createElement('span');
            num.innerText = dayNum;
            cell.appendChild(num);

            var m = marks[dateStr];
            if (m){
                var wrap = document.createElement('div');
                wrap.className = 'dot-wrap';
                if (m.exam && m.exam.length){
                    var d1 = document.createElement('i');
                    d1.className = 'dot exam-dot';
                    wrap.appendChild(d1);
                }
                if (m.task){
                    var d2 = document.createElement('i');
                    d2.className = 'dot task-dot';
                    wrap.appendChild(d2);
                }
                if (m.pomo > 0){
                    var d3 = document.createElement('i');
                    d3.className = 'dot pomo-dot';
                    wrap.appendChild(d3);
                }
                if (m.scheduled && m.scheduled.length){
                    var d4 = document.createElement('i');
                    d4.className = 'dot plan-dot';
                    wrap.appendChild(d4);
                }
                if (wrap.children.length > 0) cell.appendChild(wrap);
            }

            cell.addEventListener('click', function(){
                calSelectedDate = dateStr;
                renderCalendar();
                showDayDetail(dateStr, marks);
            });

            gridEl.appendChild(cell);
        })(d);
    }
}
function showDayDetail(date, marks){
    var box = document.getElementById('calDetail');
    if (!box) return;
    var m = marks[date];
    var doneTasks = taskList.filter(function(t){
        if (t.type === 'once') return false;
        return (t.completedDates || []).indexOf(date) !== -1;
    });

    var html = '<div class="detail-title">' + date + '</div>';
    var has = false;

    if (m && m.exam && m.exam.length){
        m.exam.forEach(function(name){
            html += '<div class="detail-item"><span class="badge badge-exam">考试</span>' + escapeHtml(name) + '</div>';
        });
        has = true;
    }
    if (m && m.scheduled && m.scheduled.length){
        m.scheduled.forEach(function(name){
            html += '<div class="detail-item"><span class="badge badge-plan">计划</span>' + escapeHtml(name) + '</div>';
        });
        has = true;
    }
    doneTasks.forEach(function(t){
        html += '<div class="detail-item"><span class="badge badge-task">任务</span>' + escapeHtml(t.name) + '</div>';
        has = true;
    });
    if (m && m.pomo > 0){
        html += '<div class="detail-item"><span class="badge badge-pomo">番茄</span>完成 ' + m.pomo + ' 个番茄</div>';
        has = true;
    }
    if (!has){
        html += '<div style="color:var(--ink-3);margin-bottom:4px">这一天还没有记录</div>';
    }

    html += '<div class="cal-add-task">' +
            '<input type="text" id="calTaskInput" placeholder="给 ' + date + ' 加个任务…">' +
            '<button class="btn-primary" id="calTaskAddBtn">添加</button>' +
            '</div>';

    box.innerHTML = html;
    box.classList.add('show');

    var addBtn = document.getElementById('calTaskAddBtn');
    if (addBtn){
        addBtn.onclick = function(){
            var inp = document.getElementById('calTaskInput');
            var name = (inp.value || '').trim();
            if (!name) return;
            if (hasSameTask(name)){
                if (!confirm('任务【' + name + '】已存在，仍要添加吗？')) return;
            }
            taskList.push({
                id: uid(),
                name: name,
                type: 'once',
                targetCount: 1,
                completedDates: [],
                done: false,
                createdAt: getToday(),
                energy: 'mid',
                dependsOn: null,
                scheduledDate: date
            });
            save('task_v2', taskList);
            renderTask();
            var newMarks = collectDayMarks();
            showDayDetail(date, newMarks);
            toast('已添加任务到 ' + date);
        };
        var calInp = document.getElementById('calTaskInput');
        if (calInp){
            calInp.addEventListener('keydown', function(e){
                if (e.key === 'Enter'){ e.preventDefault(); addBtn.click(); }
            });
        }
    }
}

(function bindCalendarUI(){
    function bind(){
        var prev = document.getElementById('calPrevBtn');
        var next = document.getElementById('calNextBtn');
        if (prev && !prev.dataset.bound){
            prev.dataset.bound = '1';
            prev.addEventListener('click', function(){
                calMonth--;
                if (calMonth < 0){ calMonth = 11; calYear--; }
                calSelectedDate = null;
                var d = document.getElementById('calDetail');
                if (d) d.classList.remove('show');
                renderCalendar();
            });
        }
        if (next && !next.dataset.bound){
            next.dataset.bound = '1';
            next.addEventListener('click', function(){
                calMonth++;
                if (calMonth > 11){ calMonth = 0; calYear++; }
                calSelectedDate = null;
                var d = document.getElementById('calDetail');
                if (d) d.classList.remove('show');
                renderCalendar();
            });
        }
    }
    if (document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    window.addEventListener('load', function(){
        setTimeout(renderCalendar, 300);
    });
})();

/* ===================== 页面加载 ===================== */
window.onload = function(){
    checkSetup();

    migrateExams();
    renderExams();
    renderRingtoneUI();
    calcCountAndShow();

    var hashTab = (location.hash || "").replace("#", "");
    if (["ai","task","calendar","pomodoro","note","exam","goal","growth","resource"].indexOf(hashTab) !== -1){
        switchTab(hashTab);
    }

    renderTask();
    loadCheck();
    renderNoteList();
    renderChat();
    updatePomodoroDisplay();
    updatePomodoroCount();
    updateAiStatus();

    applyGoalDecay();
    renderGoals();
    renderDecTree();
    renderWeekly();
    renderCapsules();
    renderObstacles();
    renderResources();
    renderMilestones();
    updateEnergyTip();
    updatePeriodicTip();

    // Tab 滑动箭头
    (function bindTabsArrow(){
        var wrap = document.querySelector('.tabs-wrapper');
        var tabs = document.getElementById('tabNav');
        var arrow = document.getElementById('tabsArrow');
        if (!wrap || !tabs || !arrow) return;
        function updateArrow(){
            var atEnd = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 6;
            arrow.classList.toggle('hide', atEnd);
        }
        tabs.addEventListener('scroll', updateArrow);
        window.addEventListener('resize', updateArrow);
        setTimeout(updateArrow, 200);
    })();

    setTimeout(function(){
        var history = load("checkHistory", []);
        var today = getToday();
        var unchecked = history.indexOf(today) === -1;
        var required = taskList.filter(isRequiredTask);
        var undone = required.filter(function(t){ return !getTaskProgress(t).isComplete; });
        if (unchecked && undone.length > 0 && chatHistory.length === 0){
            chatHistory.push({ role: "ai", content: "你好！今天还没打卡，还有 " + undone.length + " 个必做任务待完成。\n\n需要我帮你安排优先级吗？也可以直接跟我说\"帮我加个每天背单词的任务\"。" });
            renderChat();
            saveChat();
        }
    }, 800);
};