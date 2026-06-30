// ===== 포맷 유틸리티 =====
const fmt = {
  // 숫자에 콤마 (입력값 → 표시용)
  number(v) {
    if (v === null || v === undefined || v === '') return '';
    return Number(v).toLocaleString('ko-KR');
  },
  // 콤마 제거 (저장 시)
  parseNumber(s) {
    if (!s) return 0;
    return parseFloat(String(s).replace(/,/g, '')) || 0;
  },
  // 금액 표시 (억/만 단위)
  money(v) {
    if (!v) return '-';
    if (v >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, '') + '억';
    if (v >= 10000) return Math.round(v / 10000).toLocaleString() + '만';
    return v.toLocaleString('ko-KR');
  },
  // 전화번호 자동 하이픈
  phone(v) {
    if (!v) return v;
    const d = v.replace(/\D/g, '');
    if (d.startsWith('02')) {
      if (d.length <= 9) return d.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
      return d.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3');
    }
    if (d.length <= 10) return d.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    return d.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  },
  // 이메일 유효성
  isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  },
  // 날짜 표시 (YYYY-MM-DD → YYYY.MM.DD)
  date(v) {
    if (!v) return '-';
    return v.replace(/-/g, '.');
  }
};

// 숫자 입력 필드에 실시간 콤마 적용
function applyNumberFormat(input) {
  input.addEventListener('input', function() {
    const raw = this.value.replace(/,/g, '');
    if (raw === '' || raw === '-') return;
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      const pos = this.selectionStart;
      const prevLen = this.value.length;
      this.value = num.toLocaleString('ko-KR');
      const newLen = this.value.length;
      this.setSelectionRange(pos + (newLen - prevLen), pos + (newLen - prevLen));
    }
  });
}

// 전화번호 입력 필드에 자동 하이픈
function applyPhoneFormat(input) {
  input.addEventListener('input', function() {
    const pos = this.selectionStart;
    const formatted = fmt.phone(this.value);
    if (formatted !== undefined) this.value = formatted;
  });
}

// 모달 내 특수 필드 자동 포맷 적용
function applyModalFormatting(overlay) {
  overlay.querySelectorAll('input[name="phone"]').forEach(applyPhoneFormat);
  overlay.querySelectorAll('input[type="number"], input[name$="revenue"], input[name="amount"], input[name="headcount"]').forEach(el => {
    el.type = 'text';
    el.setAttribute('inputmode', 'numeric');
    applyNumberFormat(el);
  });
}

// ===== API =====
const api = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async put(url, body) {
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async del(url) {
    const r = await fetch(url, { method: 'DELETE' });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
};

// ===== 네비게이션 =====
function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');
  const titles = {
    dashboard: '대시보드', leads: '리드관리', customers: '고객관리', pipeline: '파이프라인',
    projects: '프로젝트 현황', contracts: '계약관리', sites: '현장관리', issues: '이슈관리',
    meetings: '미팅관리', emails: '메일관리', tasks: '할일', schedules: '일정',
    insights: '메모·인사이트', settings: '설정'
  };
  document.getElementById('page-title').textContent = titles[page] || page;
  const loaders = {
    dashboard: loadDashboard, leads: loadLeads, customers: loadCustomers,
    pipeline: loadPipeline, projects: loadProjects, contracts: loadContracts,
    sites: loadSites, issues: loadIssues, meetings: loadMeetings,
    emails: loadEmails, tasks: loadTasks, schedules: loadSchedules,
    insights: loadInsights, settings: loadSettings
  };
  if (loaders[page]) loaders[page]();
}

// ===== 뱃지 =====
function statusBadge(status) {
  const map = {
    '신규': 'badge-blue', '접촉중': 'badge-yellow', '미팅완료': 'badge-purple',
    '제안': 'badge-purple', '종료': 'badge-gray',
    '진행중': 'badge-green', '완료': 'badge-gray', '보류': 'badge-yellow',
    '미처리': 'badge-red', '처리중': 'badge-yellow', '처리완료': 'badge-green',
    '발굴': 'badge-blue', '접촉': 'badge-yellow', '협상': 'badge-purple',
    '수주': 'badge-green', '탈락': 'badge-gray',
    '발송완료': 'badge-green', '회신대기': 'badge-yellow', '회신완료': 'badge-green',
    '운영중': 'badge-green', '일부중단': 'badge-yellow', '중단': 'badge-red',
    'A': 'badge-green', 'B': 'badge-blue', 'C': 'badge-yellow',
    '상': 'badge-red', '중': 'badge-yellow', '하': 'badge-blue',
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${status || '-'}</span>`;
}

// ===== 모달 =====
function showModal(title, bodyHtml, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-footer">
        <button class="btn-secondary modal-cancel">취소</button>
        <button class="btn-primary modal-save">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  applyModalFormatting(overlay);
  overlay.querySelector('.modal-close').onclick = () => overlay.remove();
  overlay.querySelector('.modal-cancel').onclick = () => overlay.remove();
  overlay.querySelector('.modal-save').onclick = async () => {
    try {
      await onSave(overlay);
      overlay.remove();
    } catch (e) { alert('저장 실패: ' + e.message); }
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function getFormData(overlay, fields) {
  const data = {};
  fields.forEach(f => {
    const el = overlay.querySelector(`[name="${f}"]`);
    if (!el) return;
    if (el.type === 'checkbox') {
      data[f] = el.checked;
    } else if (['revenue', 'expected_revenue', 'amount'].includes(f)) {
      data[f] = fmt.parseNumber(el.value);
    } else if (f === 'headcount') {
      data[f] = parseInt(el.value.replace(/,/g, '')) || 0;
    } else {
      data[f] = el.value;
    }
  });
  return data;
}

// 이메일 유효성 표시
function emailInput(val = '') {
  return `<input name="email" value="${val}" placeholder="example@company.com"
    oninput="validateEmail(this)">
    <small class="email-hint" style="color:#636e72;font-size:11px"></small>`;
}
function validateEmail(el) {
  const hint = el.nextElementSibling;
  if (!hint) return;
  if (!el.value) { hint.textContent = ''; return; }
  hint.textContent = fmt.isEmail(el.value) ? '✓ 올바른 이메일 형식' : '✗ 이메일 형식을 확인하세요';
  hint.style.color = fmt.isEmail(el.value) ? '#00b894' : '#e17055';
}

// ===== 대시보드 =====
async function loadDashboard() {
  const d = await api.get('/api/v1/dashboard');
  const { kpi, pipeline_stages, recent_leads, recent_meetings, recent_tasks } = d;
  document.getElementById('kpi-leads').textContent = kpi.leads.toLocaleString();
  document.getElementById('kpi-projects').textContent = kpi.active_projects.toLocaleString();
  document.getElementById('kpi-tasks').textContent = kpi.pending_tasks.toLocaleString();
  document.getElementById('kpi-revenue').textContent = fmt.money(kpi.total_revenue);
  const maxStage = Math.max(...Object.values(pipeline_stages), 1);
  document.getElementById('pipeline-summary').innerHTML = ['발굴','접촉','제안','협상','수주','탈락'].map(s => `
    <div class="pipeline-row">
      <span class="label">${s}</span>
      <div class="pipeline-track"><div class="pipeline-fill" style="width:${(pipeline_stages[s]||0)/maxStage*100}%"></div></div>
      <span class="pipeline-num">${pipeline_stages[s]||0}</span>
    </div>`).join('');
  const timeline = [
    ...recent_leads.map(l => ({ icon: '👤', title: `리드 등록: ${l.company}`, sub: l.status, time: fmt.date(l.created_at?.slice(0,10)) })),
    ...recent_meetings.map(m => ({ icon: '🤝', title: `미팅: ${m.title}`, sub: m.counterpart, time: fmt.date(m.date) })),
    ...recent_tasks.map(t => ({ icon: t.done ? '✅' : '📋', title: t.title, sub: t.done ? '완료' : '미완료', time: fmt.date(t.due_date) })),
  ].slice(0, 8);
  document.getElementById('timeline').innerHTML = timeline.map(t => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div><h4>${t.icon} ${t.title}</h4><p>${t.sub || ''} ${t.time ? '· ' + t.time : ''}</p></div>
    </div>`).join('') || '<p style="color:#999;font-size:13px">활동 내역이 없습니다.</p>';
}

// ===== 리드 =====
async function loadLeads(q = '', status = '') {
  let url = '/api/v1/leads?';
  if (q) url += `q=${encodeURIComponent(q)}&`;
  if (status) url += `status=${encodeURIComponent(status)}&`;
  const data = await api.get(url);
  document.getElementById('leads-tbody').innerHTML = data.map(l => `
    <tr>
      <td>${l.company || '-'}</td>
      <td>${l.contact || '-'}</td>
      <td>${fmt.phone(l.phone) || '-'}</td>
      <td>${l.email ? `<a href="mailto:${l.email}" style="color:#00b894">${l.email}</a>` : '-'}</td>
      <td>${statusBadge(l.status)}</td>
      <td>${l.source || '-'}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.memo || '-'}</td>
      <td>
        <button class="btn-icon" onclick="editLead(${l.id})">수정</button>
        <button class="btn-danger" onclick="deleteLead(${l.id})">삭제</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="8" class="empty-state">데이터 없음</td></tr>`;
}

function leadForm(l = {}) {
  const statuses = ['신규','접촉중','미팅완료','제안','종료'];
  return `
    <div class="form-row">
      <div class="form-group"><label>회사명</label><input name="company" value="${l.company||''}"></div>
      <div class="form-group"><label>담당자</label><input name="contact" value="${l.contact||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>전화 (자동 하이픈)</label><input name="phone" value="${fmt.phone(l.phone)||''}" placeholder="010-0000-0000"></div>
      <div class="form-group"><label>이메일</label>${emailInput(l.email||'')}</div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>상태</label><select name="status">${statuses.map(s=>`<option ${l.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label>출처</label><input name="source" value="${l.source||''}"></div>
    </div>
    <div class="form-group"><label>메모</label><textarea name="memo">${l.memo||''}</textarea></div>`;
}

function addLead() {
  showModal('리드 추가', leadForm(), async (overlay) => {
    await api.post('/api/v1/leads/', getFormData(overlay, ['company','contact','phone','email','status','source','memo']));
    loadLeads();
  });
}
async function editLead(id) {
  const l = await api.get(`/api/v1/leads/${id}`);
  showModal('리드 수정', leadForm(l), async (overlay) => {
    await api.put(`/api/v1/leads/${id}`, getFormData(overlay, ['company','contact','phone','email','status','source','memo']));
    loadLeads();
  });
}
async function deleteLead(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  await api.del(`/api/v1/leads/${id}`); loadLeads();
}

// ===== 고객 =====
async function loadCustomers(q = '') {
  const data = await api.get(`/api/v1/customers/?q=${encodeURIComponent(q)}`);
  document.getElementById('customers-tbody').innerHTML = data.map(c => `
    <tr>
      <td>${c.company||'-'}</td>
      <td>${c.contact||'-'}</td>
      <td>${fmt.phone(c.phone)||'-'}</td>
      <td>${c.email ? `<a href="mailto:${c.email}" style="color:#00b894">${c.email}</a>` : '-'}</td>
      <td>${statusBadge(c.grade)}</td>
      <td>${c.memo||'-'}</td>
      <td>
        <button class="btn-icon" onclick="editCustomer(${c.id})">수정</button>
        <button class="btn-danger" onclick="deleteCustomer(${c.id})">삭제</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="7" class="empty-state">데이터 없음</td></tr>`;
}

function customerForm(c = {}) {
  return `
    <div class="form-row">
      <div class="form-group"><label>회사명</label><input name="company" value="${c.company||''}"></div>
      <div class="form-group"><label>담당자</label><input name="contact" value="${c.contact||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>전화 (자동 하이픈)</label><input name="phone" value="${fmt.phone(c.phone)||''}" placeholder="010-0000-0000"></div>
      <div class="form-group"><label>이메일</label>${emailInput(c.email||'')}</div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>등급</label><select name="grade"><option ${c.grade==='A'?'selected':''}>A</option><option ${c.grade==='B'?'selected':''}>B</option><option ${c.grade==='C'?'selected':''}>C</option></select></div>
    </div>
    <div class="form-group"><label>메모</label><textarea name="memo">${c.memo||''}</textarea></div>`;
}

function addCustomer() {
  showModal('고객 추가', customerForm(), async (overlay) => {
    await api.post('/api/v1/customers/', getFormData(overlay, ['company','contact','phone','email','grade','memo']));
    loadCustomers();
  });
}
async function editCustomer(id) {
  const c = await api.get(`/api/v1/customers/${id}`);
  showModal('고객 수정', customerForm(c), async (overlay) => {
    await api.put(`/api/v1/customers/${id}`, getFormData(overlay, ['company','contact','phone','email','grade','memo']));
    loadCustomers();
  });
}
async function deleteCustomer(id) {
  if (!confirm('삭제?')) return;
  await api.del(`/api/v1/customers/${id}`); loadCustomers();
}

// ===== 파이프라인 =====
const STAGES = ['발굴','접촉','제안','협상','수주','탈락'];
let allDeals = [], dragItem = null;

async function loadPipeline() {
  allDeals = await api.get('/api/v1/pipeline/');
  renderKanban();
}

function renderKanban() {
  document.getElementById('kanban-board').innerHTML = STAGES.map(stage => {
    const deals = allDeals.filter(d => d.stage === stage);
    return `
      <div class="kanban-col" data-stage="${stage}" ondragover="onDragOver(event)" ondrop="onDrop(event,'${stage}')">
        <div class="kanban-col-header">
          <span class="kanban-col-title">${stage}</span>
          <span class="kanban-count">${deals.length}</span>
        </div>
        ${deals.map(d => `
          <div class="kanban-card" draggable="true" data-id="${d.id}" ondragstart="onDragStart(event,${d.id})">
            <h4>${d.company||'-'}</h4>
            <p>${d.contact||'-'} ${d.segment ? '· '+d.segment : ''}</p>
            ${d.expected_revenue ? `<div class="revenue">${fmt.money(d.expected_revenue)}</div>` : ''}
            <div style="display:flex;gap:4px;margin-top:8px">
              <button class="btn-icon" onclick="editDeal(${d.id})">수정</button>
              <button class="btn-danger" onclick="deleteDeal(${d.id})">삭제</button>
            </div>
          </div>`).join('')}
      </div>`;
  }).join('');
}

function onDragStart(e, id) { dragItem = id; e.currentTarget.classList.add('dragging'); }
function onDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
async function onDrop(e, stage) {
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  if (dragItem) { await api.put(`/api/v1/pipeline/${dragItem}`, { stage }); dragItem = null; loadPipeline(); }
}

function dealForm(d = {}) {
  return `
    <div class="form-row">
      <div class="form-group"><label>회사명</label><input name="company" value="${d.company||''}"></div>
      <div class="form-group"><label>담당자</label><input name="contact" value="${d.contact||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>단계</label><select name="stage">${STAGES.map(s=>`<option ${d.stage===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label>예상매출 (원, 콤마 자동)</label><input name="expected_revenue" type="text" inputmode="numeric" value="${d.expected_revenue ? fmt.number(d.expected_revenue) : ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>세그먼트</label><input name="segment" value="${d.segment||''}"></div>
      <div class="form-group"><label>최근 연락</label><input name="last_contact" type="date" value="${d.last_contact||''}"></div>
    </div>
    <div class="form-group"><label>다음 액션</label><input name="next_action" value="${d.next_action||''}"></div>
    <div class="form-group"><label>메모</label><textarea name="memo">${d.memo||''}</textarea></div>`;
}

function addDeal() {
  showModal('딜 추가', dealForm(), async (overlay) => {
    await api.post('/api/v1/pipeline/', getFormData(overlay, ['company','contact','stage','expected_revenue','segment','last_contact','next_action','memo']));
    loadPipeline();
  });
}
async function editDeal(id) {
  const d = await api.get(`/api/v1/pipeline/${id}`);
  showModal('딜 수정', dealForm(d), async (overlay) => {
    await api.put(`/api/v1/pipeline/${id}`, getFormData(overlay, ['company','contact','stage','expected_revenue','segment','last_contact','next_action','memo']));
    loadPipeline();
  });
}
async function deleteDeal(id) {
  if (!confirm('삭제?')) return;
  await api.del(`/api/v1/pipeline/${id}`); loadPipeline();
}

// ===== 프로젝트 =====
async function loadProjects(q = '', status = '') {
  let url = '/api/v1/projects/?';
  if (q) url += `q=${encodeURIComponent(q)}&`;
  if (status) url += `status=${encodeURIComponent(status)}&`;
  const data = await api.get(url);
  const totalRevenue = data.reduce((sum, p) => sum + (p.revenue || 0), 0);
  document.getElementById('projects-total-revenue').textContent = fmt.money(totalRevenue);
  document.getElementById('projects-tbody').innerHTML = data.map(p => `
    <tr>
      <td>${p.name||'-'}</td>
      <td>${p.type||'-'}</td>
      <td>${statusBadge(p.status)}</td>
      <td>${p.assignee||'-'}</td>
      <td style="font-weight:600;color:#00b894">${p.revenue ? fmt.number(p.revenue) + '원' : '-'}</td>
      <td>${fmt.date(p.start_date)}</td>
      <td>${fmt.date(p.end_date)}</td>
      <td>
        <button class="btn-icon" onclick="editProject(${p.id})">수정</button>
        <button class="btn-danger" onclick="deleteProject(${p.id})">삭제</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="8" class="empty-state">데이터 없음</td></tr>`;
}

function projectForm(p = {}) {
  const statuses = ['진행중','완료','보류','취소'];
  return `
    <div class="form-group"><label>프로젝트명</label><input name="name" value="${p.name||''}"></div>
    <div class="form-row">
      <div class="form-group"><label>유형</label><input name="type" value="${p.type||''}"></div>
      <div class="form-group"><label>상태</label><select name="status">${statuses.map(s=>`<option ${p.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>담당자</label><input name="assignee" value="${p.assignee||''}"></div>
      <div class="form-group"><label>매출 (원, 콤마 자동)</label><input name="revenue" type="text" inputmode="numeric" value="${p.revenue ? fmt.number(p.revenue) : ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>시작일</label><input name="start_date" type="date" value="${p.start_date||''}"></div>
      <div class="form-group"><label>종료일</label><input name="end_date" type="date" value="${p.end_date||''}"></div>
    </div>
    <div class="form-group"><label>메모</label><textarea name="memo">${p.memo||''}</textarea></div>`;
}

function addProject() {
  showModal('프로젝트 추가', projectForm(), async (overlay) => {
    await api.post('/api/v1/projects/', getFormData(overlay, ['name','type','status','assignee','revenue','start_date','end_date','memo']));
    loadProjects();
  });
}
async function editProject(id) {
  const p = await api.get(`/api/v1/projects/${id}`);
  showModal('프로젝트 수정', projectForm(p), async (overlay) => {
    await api.put(`/api/v1/projects/${id}`, getFormData(overlay, ['name','type','status','assignee','revenue','start_date','end_date','memo']));
    loadProjects();
  });
}
async function deleteProject(id) {
  if (!confirm('삭제?')) return;
  await api.del(`/api/v1/projects/${id}`); loadProjects();
}

// ===== 계약 =====
async function loadContracts() {
  const data = await api.get('/api/v1/contracts/');
  const projects = await api.get('/api/v1/projects/');
  const pMap = {};
  projects.forEach(p => pMap[p.id] = p.name);
  document.getElementById('contracts-tbody').innerHTML = data.map(c => `
    <tr>
      <td>${pMap[c.project_id] || '-'}</td>
      <td>${fmt.date(c.signed_date)}</td>
      <td style="font-weight:600;color:#00b894">${c.amount ? fmt.number(c.amount) + '원' : '-'}</td>
      <td>${fmt.date(c.renewal_date)}</td>
      <td>${c.memo||'-'}</td>
      <td>
        <button class="btn-icon" onclick="editContract(${c.id})">수정</button>
        <button class="btn-danger" onclick="deleteContract(${c.id})">삭제</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="6" class="empty-state">데이터 없음</td></tr>`;
}

async function contractForm(c = {}) {
  const projects = await api.get('/api/v1/projects/');
  return `
    <div class="form-group"><label>프로젝트</label><select name="project_id">
      <option value="">선택 안함</option>
      ${projects.map(p=>`<option value="${p.id}" ${c.project_id==p.id?'selected':''}>${p.name}</option>`).join('')}
    </select></div>
    <div class="form-row">
      <div class="form-group"><label>계약일</label><input name="signed_date" type="date" value="${c.signed_date||''}"></div>
      <div class="form-group"><label>갱신일</label><input name="renewal_date" type="date" value="${c.renewal_date||''}"></div>
    </div>
    <div class="form-group"><label>금액 (원, 콤마 자동)</label><input name="amount" type="text" inputmode="numeric" value="${c.amount ? fmt.number(c.amount) : ''}"></div>
    <div class="form-group"><label>메모</label><textarea name="memo">${c.memo||''}</textarea></div>`;
}

async function addContract() {
  showModal('계약 추가', await contractForm(), async (overlay) => {
    const data = getFormData(overlay, ['project_id','signed_date','renewal_date','amount','memo']);
    data.project_id = data.project_id ? parseInt(data.project_id) : null;
    await api.post('/api/v1/contracts/', data); loadContracts();
  });
}
async function editContract(id) {
  const c = await api.get(`/api/v1/contracts/${id}`);
  showModal('계약 수정', await contractForm(c), async (overlay) => {
    const data = getFormData(overlay, ['project_id','signed_date','renewal_date','amount','memo']);
    data.project_id = data.project_id ? parseInt(data.project_id) : null;
    await api.put(`/api/v1/contracts/${id}`, data); loadContracts();
  });
}
async function deleteContract(id) {
  if (!confirm('삭제?')) return;
  await api.del(`/api/v1/contracts/${id}`); loadContracts();
}

// ===== 현장 =====
async function loadSites() {
  const data = await api.get('/api/v1/sites/');
  document.getElementById('sites-tbody').innerHTML = data.map(s => `
    <tr>
      <td>${s.name||'-'}</td>
      <td>${s.headcount ? fmt.number(s.headcount) + '명' : '-'}</td>
      <td>${statusBadge(s.status)}</td>
      <td>${s.assignee||'-'}</td>
      <td>${s.memo||'-'}</td>
      <td>
        <button class="btn-icon" onclick="editSite(${s.id})">수정</button>
        <button class="btn-danger" onclick="deleteSite(${s.id})">삭제</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="6" class="empty-state">데이터 없음</td></tr>`;
}

function siteForm(s = {}) {
  const statuses = ['운영중','일부중단','중단','준비중'];
  return `
    <div class="form-row">
      <div class="form-group"><label>현장명</label><input name="name" value="${s.name||''}"></div>
      <div class="form-group"><label>인원수</label><input name="headcount" type="text" inputmode="numeric" value="${s.headcount ? fmt.number(s.headcount) : ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>상태</label><select name="status">${statuses.map(st=>`<option ${s.status===st?'selected':''}>${st}</option>`).join('')}</select></div>
      <div class="form-group"><label>담당자</label><input name="assignee" value="${s.assignee||''}"></div>
    </div>
    <div class="form-group"><label>메모</label><textarea name="memo">${s.memo||''}</textarea></div>`;
}

function addSite() {
  showModal('현장 추가', siteForm(), async (overlay) => {
    await api.post('/api/v1/sites/', getFormData(overlay, ['name','headcount','status','assignee','memo']));
    loadSites();
  });
}
async function editSite(id) {
  const s = await api.get(`/api/v1/sites/${id}`);
  showModal('현장 수정', siteForm(s), async (overlay) => {
    await api.put(`/api/v1/sites/${id}`, getFormData(overlay, ['name','headcount','status','assignee','memo']));
    loadSites();
  });
}
async function deleteSite(id) {
  if (!confirm('삭제?')) return;
  await api.del(`/api/v1/sites/${id}`); loadSites();
}

// ===== 이슈 =====
async function loadIssues() {
  const data = await api.get('/api/v1/issues/');
  document.getElementById('issues-tbody').innerHTML = data.map(i => `
    <tr>
      <td>${i.title||'-'}</td>
      <td>${statusBadge(i.severity)}</td>
      <td>${statusBadge(i.status)}</td>
      <td>${i.assignee||'-'}</td>
      <td>${fmt.date(i.due_date)}</td>
      <td>${i.memo||'-'}</td>
      <td>
        <button class="btn-icon" onclick="editIssue(${i.id})">수정</button>
        <button class="btn-danger" onclick="deleteIssue(${i.id})">삭제</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="7" class="empty-state">데이터 없음</td></tr>`;
}

function issueForm(i = {}) {
  return `
    <div class="form-group"><label>이슈 제목</label><input name="title" value="${i.title||''}"></div>
    <div class="form-row">
      <div class="form-group"><label>심각도</label><select name="severity">
        <option ${i.severity==='상'?'selected':''}>상</option>
        <option ${i.severity==='중'||!i.severity?'selected':''}>중</option>
        <option ${i.severity==='하'?'selected':''}>하</option>
      </select></div>
      <div class="form-group"><label>처리상태</label><select name="status">
        <option ${i.status==='미처리'||!i.status?'selected':''}>미처리</option>
        <option ${i.status==='처리중'?'selected':''}>처리중</option>
        <option ${i.status==='처리완료'?'selected':''}>처리완료</option>
      </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>담당자</label><input name="assignee" value="${i.assignee||''}"></div>
      <div class="form-group"><label>마감일</label><input name="due_date" type="date" value="${i.due_date||''}"></div>
    </div>
    <div class="form-group"><label>메모</label><textarea name="memo">${i.memo||''}</textarea></div>`;
}

function addIssue() {
  showModal('이슈 추가', issueForm(), async (overlay) => {
    await api.post('/api/v1/issues/', getFormData(overlay, ['title','severity','status','assignee','due_date','memo']));
    loadIssues();
  });
}
async function editIssue(id) {
  const i = await api.get(`/api/v1/issues/${id}`);
  showModal('이슈 수정', issueForm(i), async (overlay) => {
    await api.put(`/api/v1/issues/${id}`, getFormData(overlay, ['title','severity','status','assignee','due_date','memo']));
    loadIssues();
  });
}
async function deleteIssue(id) {
  if (!confirm('삭제?')) return;
  await api.del(`/api/v1/issues/${id}`); loadIssues();
}

// ===== 미팅 =====
async function loadMeetings() {
  const data = await api.get('/api/v1/meetings/');
  document.getElementById('meetings-tbody').innerHTML = data.map(m => `
    <tr>
      <td>${m.title||'-'}</td>
      <td>${m.counterpart||'-'}</td>
      <td>${fmt.date(m.date)}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.agenda||'-'}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.result||'-'}</td>
      <td>${m.followup||'-'}</td>
      <td>
        <button class="btn-icon" onclick="editMeeting(${m.id})">수정</button>
        <button class="btn-danger" onclick="deleteMeeting(${m.id})">삭제</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="7" class="empty-state">데이터 없음</td></tr>`;
}

function meetingForm(m = {}) {
  return `
    <div class="form-row">
      <div class="form-group"><label>제목</label><input name="title" value="${m.title||''}"></div>
      <div class="form-group"><label>상대방</label><input name="counterpart" value="${m.counterpart||''}"></div>
    </div>
    <div class="form-group"><label>일시</label><input name="date" type="date" value="${m.date||''}"></div>
    <div class="form-group"><label>안건</label><textarea name="agenda">${m.agenda||''}</textarea></div>
    <div class="form-group"><label>결과</label><textarea name="result">${m.result||''}</textarea></div>
    <div class="form-group"><label>팔로업</label><input name="followup" value="${m.followup||''}"></div>`;
}

function addMeeting() {
  showModal('미팅 추가', meetingForm(), async (overlay) => {
    await api.post('/api/v1/meetings/', getFormData(overlay, ['title','counterpart','date','agenda','result','followup']));
    loadMeetings();
  });
}
async function editMeeting(id) {
  const m = await api.get(`/api/v1/meetings/${id}`);
  showModal('미팅 수정', meetingForm(m), async (overlay) => {
    await api.put(`/api/v1/meetings/${id}`, getFormData(overlay, ['title','counterpart','date','agenda','result','followup']));
    loadMeetings();
  });
}
async function deleteMeeting(id) {
  if (!confirm('삭제?')) return;
  await api.del(`/api/v1/meetings/${id}`); loadMeetings();
}

// ===== 메일 =====
async function loadEmails() {
  const data = await api.get('/api/v1/emails/');
  document.getElementById('emails-tbody').innerHTML = data.map(e => `
    <tr>
      <td>${e.to_company||'-'}</td>
      <td>${e.subject||'-'}</td>
      <td>${fmt.date(e.sent_at)}</td>
      <td>${statusBadge(e.status)}</td>
      <td>${e.memo||'-'}</td>
      <td>
        <button class="btn-icon" onclick="editEmail(${e.id})">수정</button>
        <button class="btn-danger" onclick="deleteEmail(${e.id})">삭제</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="6" class="empty-state">데이터 없음</td></tr>`;
}

function emailMgmtForm(e = {}) {
  const statuses = ['발송완료','회신대기','회신완료','취소'];
  return `
    <div class="form-row">
      <div class="form-group"><label>수신사</label><input name="to_company" value="${e.to_company||''}"></div>
      <div class="form-group"><label>발송일</label><input name="sent_at" type="date" value="${e.sent_at||''}"></div>
    </div>
    <div class="form-group"><label>제목</label><input name="subject" value="${e.subject||''}"></div>
    <div class="form-group"><label>상태</label><select name="status">${statuses.map(s=>`<option ${e.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
    <div class="form-group"><label>메모</label><textarea name="memo">${e.memo||''}</textarea></div>`;
}

function addEmail() {
  showModal('메일 추가', emailMgmtForm(), async (overlay) => {
    await api.post('/api/v1/emails/', getFormData(overlay, ['to_company','subject','sent_at','status','memo']));
    loadEmails();
  });
}
async function editEmail(id) {
  const e = await api.get(`/api/v1/emails/${id}`);
  showModal('메일 수정', emailMgmtForm(e), async (overlay) => {
    await api.put(`/api/v1/emails/${id}`, getFormData(overlay, ['to_company','subject','sent_at','status','memo']));
    loadEmails();
  });
}
async function deleteEmail(id) {
  if (!confirm('삭제?')) return;
  await api.del(`/api/v1/emails/${id}`); loadEmails();
}

// ===== 할일 =====
async function loadTasks() {
  const data = await api.get('/api/v1/tasks/');
  document.getElementById('tasks-tbody').innerHTML = data.map(t => `
    <tr class="${t.done?'task-done':''}">
      <td><input type="checkbox" class="task-check" ${t.done?'checked':''} onchange="toggleTask(${t.id},this.checked)"></td>
      <td>${t.title||'-'}</td>
      <td>${fmt.date(t.due_date)}</td>
      <td>${statusBadge(t.priority)}</td>
      <td>${t.assignee||'-'}</td>
      <td>
        <button class="btn-icon" onclick="editTask(${t.id})">수정</button>
        <button class="btn-danger" onclick="deleteTask(${t.id})">삭제</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="6" class="empty-state">데이터 없음</td></tr>`;
}

async function toggleTask(id, done) {
  await api.put(`/api/v1/tasks/${id}`, { done }); loadTasks();
}

function taskForm(t = {}) {
  return `
    <div class="form-group"><label>할일 제목</label><input name="title" value="${t.title||''}"></div>
    <div class="form-row">
      <div class="form-group"><label>마감일</label><input name="due_date" type="date" value="${t.due_date||''}"></div>
      <div class="form-group"><label>우선순위</label><select name="priority">
        <option ${t.priority==='상'?'selected':''}>상</option>
        <option ${t.priority==='중'||!t.priority?'selected':''}>중</option>
        <option ${t.priority==='하'?'selected':''}>하</option>
      </select></div>
    </div>
    <div class="form-group"><label>담당자</label><input name="assignee" value="${t.assignee||''}"></div>`;
}

function addTask() {
  showModal('할일 추가', taskForm(), async (overlay) => {
    await api.post('/api/v1/tasks/', getFormData(overlay, ['title','due_date','priority','assignee']));
    loadTasks();
  });
}
async function editTask(id) {
  const t = await api.get(`/api/v1/tasks/${id}`);
  showModal('할일 수정', taskForm(t), async (overlay) => {
    await api.put(`/api/v1/tasks/${id}`, getFormData(overlay, ['title','due_date','priority','assignee']));
    loadTasks();
  });
}
async function deleteTask(id) {
  if (!confirm('삭제?')) return;
  await api.del(`/api/v1/tasks/${id}`); loadTasks();
}

// ===== 일정 캘린더 =====
let calYear, calMonth;

async function loadSchedules() {
  const now = new Date();
  if (!calYear) { calYear = now.getFullYear(); calMonth = now.getMonth(); }
  renderCalendar();
}

async function renderCalendar() {
  const monthStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}`;
  const data = await api.get(`/api/v1/schedules/?month=${monthStr}`);
  const schedMap = {};
  data.forEach(s => { if (!schedMap[s.date]) schedMap[s.date] = []; schedMap[s.date].push(s); });
  document.getElementById('cal-month-title').textContent = `${calYear}년 ${calMonth+1}월`;
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const lastDate = new Date(calYear, calMonth+1, 0).getDate();
  const today = new Date();
  const days = ['일','월','화','수','목','금','토'];
  let cells = days.map(d => `<div class="cal-day-header">${d}</div>`).join('');
  let dayCount = 1 - firstDay;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++, dayCount++) {
      const isCur = dayCount >= 1 && dayCount <= lastDate;
      const dateStr = isCur ? `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(dayCount).padStart(2,'0')}` : '';
      const isToday = isCur && calYear === today.getFullYear() && calMonth === today.getMonth() && dayCount === today.getDate();
      const events = isCur && schedMap[dateStr] ? schedMap[dateStr] : [];
      cells += `<div class="cal-day ${!isCur?'other-month':''} ${isToday?'today':''}" onclick="${isCur?`addScheduleOn('${dateStr}')`:''}" >
        <div class="day-num">${isCur ? dayCount : ''}</div>
        ${events.map(e => `<div class="cal-event" title="${e.title}" onclick="event.stopPropagation();editSchedule(${e.id})">${e.time?e.time.slice(0,5)+' ':''} ${e.title}</div>`).join('')}
      </div>`;
    }
    if (dayCount > lastDate) break;
  }
  document.getElementById('calendar-grid').innerHTML = cells;
}

function prevMonth() { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); }
function nextMonth() { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); }

function scheduleForm(s = {}) {
  return `
    <div class="form-group"><label>일정 제목</label><input name="title" value="${s.title||''}"></div>
    <div class="form-row">
      <div class="form-group"><label>날짜</label><input name="date" type="date" value="${s.date||''}"></div>
      <div class="form-group"><label>시간</label><input name="time" type="time" value="${s.time||''}"></div>
    </div>
    <div class="form-group"><label>메모</label><textarea name="memo">${s.memo||''}</textarea></div>`;
}

function addScheduleOn(date) {
  showModal('일정 추가', scheduleForm({date}), async (overlay) => {
    await api.post('/api/v1/schedules/', getFormData(overlay, ['title','date','time','memo']));
    renderCalendar();
  });
}
async function editSchedule(id) {
  const s = await api.get(`/api/v1/schedules/${id}`);
  showModal('일정 수정', scheduleForm(s), async (overlay) => {
    await api.put(`/api/v1/schedules/${id}`, getFormData(overlay, ['title','date','time','memo']));
    renderCalendar();
  });
}

// ===== 메모·인사이트 =====
async function loadInsights(q = '') {
  const data = await api.get(`/api/v1/insights/?q=${encodeURIComponent(q)}`);
  document.getElementById('insights-list').innerHTML = data.map(i => `
    <div class="insight-card">
      <h4>${i.title||'제목 없음'}</h4>
      <p>${i.content||''}</p>
      <div>${(i.tags||'').split(',').filter(t=>t.trim()).map(t=>`<span class="tag">${t.trim()}</span>`).join('')}</div>
      <div class="actions" style="margin-top:10px">
        <button class="btn-icon" onclick="editInsight(${i.id})">수정</button>
        <button class="btn-danger" onclick="deleteInsight(${i.id})">삭제</button>
        <small style="color:#999;margin-left:8px">${fmt.date(i.created_at?.slice(0,10))}</small>
      </div>
    </div>`).join('') || '<p class="empty-state">메모가 없습니다. 새 메모를 추가하세요.</p>';
}

function insightForm(i = {}) {
  return `
    <div class="form-group"><label>제목</label><input name="title" value="${i.title||''}"></div>
    <div class="form-group"><label>내용</label><textarea name="content" style="min-height:120px">${i.content||''}</textarea></div>
    <div class="form-group"><label>태그 (쉼표 구분)</label><input name="tags" value="${i.tags||''}" placeholder="예: AI, 전략, 시장조사"></div>`;
}

function addInsight() {
  showModal('메모 추가', insightForm(), async (overlay) => {
    await api.post('/api/v1/insights/', getFormData(overlay, ['title','content','tags']));
    loadInsights();
  });
}
async function editInsight(id) {
  const i = await api.get(`/api/v1/insights/${id}`);
  showModal('메모 수정', insightForm(i), async (overlay) => {
    await api.put(`/api/v1/insights/${id}`, getFormData(overlay, ['title','content','tags']));
    loadInsights();
  });
}
async function deleteInsight(id) {
  if (!confirm('삭제?')) return;
  await api.del(`/api/v1/insights/${id}`); loadInsights();
}

// ===== 설정 =====
async function loadSettings() {
  const users = await api.get('/api/v1/users');
  document.getElementById('user-list').innerHTML = users.map(u => `
    <div class="user-row">
      <div class="user-avatar">${(u.name||'?')[0]}</div>
      <div class="user-info">
        <strong>${u.name}</strong>
        <small>${u.email||'-'} · ${u.role}</small>
      </div>
    </div>`).join('');
}

function addUser() {
  showModal('사용자 추가', `
    <div class="form-group"><label>이름</label><input name="name" placeholder="홍길동"></div>
    <div class="form-group"><label>이메일</label>${emailInput()}</div>
    <div class="form-group"><label>역할</label><select name="role">
      <option>member</option><option>admin</option><option>viewer</option>
    </select></div>`, async (overlay) => {
    await api.post('/api/v1/users', getFormData(overlay, ['name','email','role']));
    loadSettings();
  });
}

// ===== 주간보고 =====
async function showWeeklyReport() {
  const r = await api.get('/api/v1/weekly-report');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:640px">
      <div class="modal-header"><h3>주간 업무 보고</h3><button class="modal-close">&times;</button></div>
      <div class="modal-body"><div class="report-area" id="report-text">${r.report}</div></div>
      <div class="modal-footer">
        <button class="btn-primary" onclick="copyReport()">클립보드 복사</button>
        <button class="btn-secondary modal-cancel">닫기</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.modal-close').onclick = () => overlay.remove();
  overlay.querySelector('.modal-cancel').onclick = () => overlay.remove();
}

function copyReport() {
  const text = document.getElementById('report-text').textContent;
  navigator.clipboard.writeText(text).then(() => alert('클립보드에 복사되었습니다.'));
}

// ===== 통합검색 =====
let searchTimeout;
function onSearch(q) {
  clearTimeout(searchTimeout);
  const resultsEl = document.getElementById('search-results');
  if (!q.trim()) { resultsEl.style.display = 'none'; return; }
  searchTimeout = setTimeout(async () => {
    const results = await api.get(`/api/v1/search?q=${encodeURIComponent(q)}`);
    if (!results.length) { resultsEl.style.display = 'none'; return; }
    resultsEl.innerHTML = results.map(r => `
      <div class="search-result-item">
        <span class="search-badge">${r.type}</span>
        <div>
          <div style="font-size:13px;font-weight:500">${r.title||'-'}</div>
          <div style="font-size:11px;color:#999">${r.sub||''}</div>
        </div>
      </div>`).join('');
    resultsEl.style.display = 'block';
  }, 300);
}

document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap'))
    document.getElementById('search-results').style.display = 'none';
});

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => { navigate('dashboard'); });
