import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD8yFXcZwgxoPhylx1RRGoB768xS-PACM",
  authDomain: "contas-lar-22a44.firebaseapp.com",
  projectId: "contas-lar-22a44",
  storageBucket: "contas-lar-22a44.firebasestorage.app",
  messagingSenderId: "907722101554",
  appId: "1:907722101554:web:9cf31e16c655f1075efd2b",
  measurementId: "G-TV0KPP9L13"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let farmaciaRegistos = [];
let higieneRegistos = [];
let todosFilter = 'todos';
let relatorioTab = 'farmacia';

const sugestoes = {
  farmacia: { nome: new Set(), comprimidos: new Set(), ml: new Set(), ampolas: new Set(), tomas: new Set(), duracao: new Set() },
  higiene:  { designacao: new Set(), qtdEmbalagem: new Set(), numEmbalagens: new Set(), usoDia: new Set() }
};

// ===== AUTOCOMPLETE ENGINE =====
function criarAutocomplete(inputEl, getSugestoes) {
  if (!inputEl) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'ac-wrapper';
  inputEl.parentNode.insertBefore(wrapper, inputEl);
  wrapper.appendChild(inputEl);

  const dropdown = document.createElement('ul');
  dropdown.className = 'ac-dropdown';
  wrapper.appendChild(dropdown);

  let activeIndex = -1;

  function renderDropdown(items) {
    dropdown.innerHTML = '';
    activeIndex = -1;
    if (items.length === 0) { dropdown.classList.remove('open'); return; }
    items.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'ac-item';
      li.textContent = item;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        inputEl.value = item;
        dropdown.classList.remove('open');
      });
      li.addEventListener('mouseenter', () => setActive(i));
      dropdown.appendChild(li);
    });
    dropdown.classList.add('open');
  }

  function setActive(index) {
    const items = dropdown.querySelectorAll('.ac-item');
    items.forEach(el => el.classList.remove('active'));
    activeIndex = index;
    if (index >= 0 && index < items.length) {
      items[index].classList.add('active');
      items[index].scrollIntoView({ block: 'nearest' });
    }
  }

  function ordenar(lista) {
    const todosNumericos = lista.every(s => s !== '' && !isNaN(Number(s)));
    if (todosNumericos) {
      return lista.slice().sort((a, b) => Number(a) - Number(b));
    }
    return lista.slice().sort((a, b) => String(a).localeCompare(String(b), 'pt'));
  }

  function filtrar(valor) {
    const lista = Array.from(getSugestoes());
    const termo = valor.trim().toLowerCase();
    if (termo === '') return ordenar(lista);
    return lista
      .filter(s => String(s).toLowerCase().includes(termo))
      .sort((a, b) => {
        const ai = String(a).toLowerCase().startsWith(termo) ? 0 : 1;
        const bi = String(b).toLowerCase().startsWith(termo) ? 0 : 1;
        if (ai !== bi) return ai - bi;
        const todosNumericos = !isNaN(Number(a)) && !isNaN(Number(b));
        return todosNumericos ? Number(a) - Number(b) : String(a).localeCompare(String(b), 'pt');
      });
  }

  inputEl.addEventListener('focus', () => renderDropdown(filtrar(inputEl.value)));
  inputEl.addEventListener('input', () => renderDropdown(filtrar(inputEl.value)));
  inputEl.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.ac-item');
    if (!dropdown.classList.contains('open')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIndex + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIndex - 1, -1)); }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); inputEl.value = items[activeIndex].textContent; dropdown.classList.remove('open'); }
    else if (e.key === 'Escape') { dropdown.classList.remove('open'); }
  });
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) dropdown.classList.remove('open');
  });
}

function preencherTomasDoMedicamento(nome) {
  if (!nome) return;
  const nomeLower = nome.trim().toLowerCase();
  const registo = farmaciaRegistos.find(r => r.nome && r.nome.trim().toLowerCase() === nomeLower);
  if (registo && registo.tomas > 0) {
    const tomasEl = document.getElementById('med-tomas');
    if (!tomasEl.value) tomasEl.value = registo.tomas;
  }
}

function inicializarAutocompletes() {
  const nomeEl = document.getElementById('med-nome');
  if (nomeEl) {
    criarAutocomplete(nomeEl, () => sugestoes.farmacia.nome);
    nomeEl.addEventListener('blur', () => {
      setTimeout(() => preencherTomasDoMedicamento(nomeEl.value), 120);
    });
  }
  ['med-comprimidos','med-ml','med-ampolas','med-tomas','med-duracao'].forEach(id => {
    const el = document.getElementById(id);
    if (el) criarAutocomplete(el, () => sugestoes.farmacia[id.split('-')[1]]);
  });
  ['hig-designacao','hig-qtd-embalagem','hig-num-embalagens','hig-uso-dia'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const key = id === 'hig-designacao' ? 'designacao' : (id === 'hig-qtd-embalagem' ? 'qtdEmbalagem' : (id === 'hig-num-embalagens' ? 'numEmbalagens' : 'usoDia'));
      criarAutocomplete(el, () => sugestoes.higiene[key]);
    }
  });
}

function atualizarSugestoesFarmacia(registos) {
  Object.values(sugestoes.farmacia).forEach(s => s.clear());
  registos.forEach(r => {
    if (r.nome)            sugestoes.farmacia.nome.add(r.nome);
    if (r.comprimidos > 0) sugestoes.farmacia.comprimidos.add(String(r.comprimidos));
    if (r.ml > 0)          sugestoes.farmacia.ml.add(String(r.ml));
    if (r.ampolas > 0)     sugestoes.farmacia.ampolas.add(String(r.ampolas));
    if (r.tomas > 0)       sugestoes.farmacia.tomas.add(String(r.tomas));
    if (r.duracao > 0)     sugestoes.farmacia.duracao.add(String(r.duracao));
  });
}

function atualizarSugestoesHigiene(registos) {
  Object.values(sugestoes.higiene).forEach(s => s.clear());
  registos.forEach(r => {
    if (r.designacao)        sugestoes.higiene.designacao.add(r.designacao);
    if (r.qtdEmbalagem > 0)  sugestoes.higiene.qtdEmbalagem.add(String(r.qtdEmbalagem));
    if (r.numEmbalagens > 0) sugestoes.higiene.numEmbalagens.add(String(r.numEmbalagens));
    if (r.usoDia > 0)        sugestoes.higiene.usoDia.add(String(r.usoDia));
  });
}

// ===== FIREBASE LISTENERS =====
const qFarmacia = query(collection(db, "farmacia"), orderBy("data", "desc"));
onSnapshot(qFarmacia, (snapshot) => {
  farmaciaRegistos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  atualizarSugestoesFarmacia(farmaciaRegistos);
  renderFarmacia();
  renderTodos();
});

const qHigiene = query(collection(db, "higiene"), orderBy("data", "desc"));
onSnapshot(qHigiene, (snapshot) => {
  higieneRegistos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  atualizarSugestoesHigiene(higieneRegistos);
  renderHigiene();
  renderTodos();
});

// ===== NAVIGATION =====
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.section;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('section-' + target).classList.add('active');
  });
});

document.getElementById('btn-limpar-farmacia').addEventListener('click', limparFormFarmacia);
document.getElementById('btn-limpar-higiene').addEventListener('click', limparFormHigiene);

// ===== FILTER BUTTONS (Todos os Registos) =====
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    todosFilter = btn.dataset.filter;
    renderTodos();
  });
});

// ===== FORMS =====
document.getElementById('form-farmacia').addEventListener('submit', async function(e) {
  e.preventDefault();
  const nome        = document.getElementById('med-nome').value.trim();
  const comprimidos = document.getElementById('med-comprimidos').value;
  const ml          = document.getElementById('med-ml').value;
  const ampolas     = document.getElementById('med-ampolas').value;
  const tomas       = document.getElementById('med-tomas').value;
  const duracao     = document.getElementById('med-duracao').value;
  const data        = document.getElementById('med-data').value;
  if (!nome) { showToast('Por favor, introduza o nome do medicamento.'); return; }
  if (!data) { showToast('Por favor, introduza a data do recibo.'); return; }
  try {
    await addDoc(collection(db, "farmacia"), {
      nome,
      comprimidos: Number(comprimidos) || 0,
      ml:          Number(ml) || 0,
      ampolas:     Number(ampolas) || 0,
      tomas:       Number(tomas) || 0,
      duracao:     Number(duracao) || 0,
      data,
      timestamp: Date.now()
    });
    limparFormFarmacia();
    showToast('✓ Medicamento guardado na nuvem!');
  } catch (error) {
    showToast('Erro ao salvar no Firebase.');
  }
});

document.getElementById('form-higiene').addEventListener('submit', async function(e) {
  e.preventDefault();
  const designacao    = document.getElementById('hig-designacao').value.trim();
  const qtdEmbalagem  = document.getElementById('hig-qtd-embalagem').value;
  const numEmbalagens = document.getElementById('hig-num-embalagens').value;
  const usoDia        = document.getElementById('hig-uso-dia').value;
  const data          = document.getElementById('hig-data').value;
  if (!designacao) { showToast('Por favor, introduza a designação.'); return; }
  if (!data) { showToast('Por favor, introduza a data.'); return; }
  try {
    await addDoc(collection(db, "higiene"), {
      designacao,
      qtdEmbalagem:  Number(qtdEmbalagem) || 0,
      numEmbalagens: Number(numEmbalagens) || 0,
      usoDia:        Number(usoDia) || 0,
      data,
      timestamp: Date.now()
    });
    limparFormHigiene();
    showToast('✓ Artigo de higiene guardado!');
  } catch (error) {
    showToast('Erro ao salvar no Firebase.');
  }
});

// ===== RENDERING =====
function renderFarmacia() {
  const list = document.getElementById('farm-list');
  const count = document.getElementById('farm-count');
  count.textContent = `${farmaciaRegistos.length} registo(s)`;
  if (farmaciaRegistos.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">💊</span><p>Nenhum medicamento registado ainda.</p></div>`;
    return;
  }
  list.innerHTML = farmaciaRegistos.map(r => `
    <div class="record-card">
      <div class="record-main">
        <div class="record-name">${escapeHtml(r.nome)}</div>
        <div class="record-meta">
          ${r.comprimidos > 0 ? `<span class="record-tag">${r.comprimidos} comp.</span>` : ''}
          ${r.ml > 0 ? `<span class="record-tag">${r.ml} mL</span>` : ''}
          ${r.ampolas > 0 ? `<span class="record-tag">${r.ampolas} amp.</span>` : ''}
          ${r.tomas > 0 ? `<span class="record-tag">${r.tomas} tomas/dia</span>` : ''}
        </div>
      </div>
      <div class="record-date">${formatarData(r.data)}</div>
      <div class="record-actions">
        <button class="btn-edit" onclick="abrirEdicao('farmacia', '${r.id}')">✎</button>
        <button class="btn-delete" onclick="eliminarRegisto('farmacia', '${r.id}')">🗑</button>
      </div>
    </div>
  `).join('');
}

function renderHigiene() {
  const list = document.getElementById('hig-list');
  const count = document.getElementById('hig-count');
  count.textContent = `${higieneRegistos.length} registo(s)`;
  if (higieneRegistos.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">🧴</span><p>Nenhum artigo de higiene registado ainda.</p></div>`;
    return;
  }
  list.innerHTML = higieneRegistos.map(r => `
    <div class="record-card">
      <div class="record-main">
        <div class="record-name">${escapeHtml(r.designacao)}</div>
        <div class="record-meta">
          <span class="record-tag">${(r.qtdEmbalagem || 0) * (r.numEmbalagens || 0)} un.</span>
          ${r.usoDia > 0 ? `<span class="record-tag">${r.usoDia} uso/dia</span>` : ''}
        </div>
      </div>
      <div class="record-date">${formatarData(r.data)}</div>
      <div class="record-actions">
        <button class="btn-edit" onclick="abrirEdicao('higiene', '${r.id}')">✎</button>
        <button class="btn-delete" onclick="eliminarRegisto('higiene', '${r.id}')">🗑</button>
      </div>
    </div>
  `).join('');
}

function renderTodos() {
  const list = document.getElementById('todos-list');
  let todos = [];
  if (todosFilter === 'todos' || todosFilter === 'farmacia') {
    todos = todos.concat(farmaciaRegistos.map(r => ({ ...r, type: 'farmacia' })));
  }
  if (todosFilter === 'todos' || todosFilter === 'higiene') {
    todos = todos.concat(higieneRegistos.map(r => ({ ...r, type: 'higiene' })));
  }
  todos.sort((a, b) => b.data.localeCompare(a.data));

  if (todos.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">📋</span><p>Nenhum registo encontrado.</p></div>`;
    return;
  }

  list.innerHTML = todos.map(r => `
    <div class="record-card">
      <div class="record-main">
        <div class="record-name">${r.type === 'farmacia' ? '💊 ' + escapeHtml(r.nome) : '🧴 ' + escapeHtml(r.designacao)}</div>
        <div class="record-meta">
          ${r.type === 'farmacia' ? `
            ${r.comprimidos > 0 ? `<span class="record-tag">${r.comprimidos} comp.</span>` : ''}
            ${r.ml > 0 ? `<span class="record-tag">${r.ml} mL</span>` : ''}
          ` : `
            <span class="record-tag">${(r.qtdEmbalagem || 0) * (r.numEmbalagens || 0)} un.</span>
          `}
        </div>
      </div>
      <div class="record-date">${formatarData(r.data)}</div>
      <div class="record-actions">
        <button class="btn-edit" onclick="abrirEdicao('${r.type}', '${r.id}')">✎</button>
        <button class="btn-delete" onclick="eliminarRegisto('${r.type}', '${r.id}')">🗑</button>
      </div>
    </div>
  `).join('');
}

// ===== ACTIONS =====
window.eliminarRegisto = async (tipo, id) => {
  if (!confirm('Tem a certeza que deseja eliminar este registo?')) return;
  try {
    await deleteDoc(doc(db, tipo, id));
    showToast('Registo eliminado.');
  } catch (e) { showToast('Erro ao eliminar.'); }
};

window.abrirEdicao = (tipo, id) => {
  const reg = (tipo === 'farmacia' ? farmaciaRegistos : higieneRegistos).find(r => r.id === id);
  if (!reg) return;
  const modal = document.getElementById('modal-overlay');
  const body = document.getElementById('modal-body');
  
  let html = `<div class="form-grid">`;
  if (tipo === 'farmacia') {
    html += `
      <div class="form-group full-width"><label>Nome</label><input type="text" id="edit-nome" value="${escapeHtml(reg.nome)}"></div>
      <div class="form-group"><label>Comprimidos</label><input type="number" id="edit-comp" value="${reg.comprimidos}"></div>
      <div class="form-group"><label>mL</label><input type="number" id="edit-ml" step="0.1" value="${reg.ml}"></div>
      <div class="form-group"><label>Ampolas</label><input type="number" id="edit-amp" value="${reg.ampolas}"></div>
      <div class="form-group"><label>Tomas/dia</label><input type="number" id="edit-tomas" value="${reg.tomas}"></div>
      <div class="form-group"><label>Duração (dias)</label><input type="number" id="edit-dur" value="${reg.duracao}"></div>
      <div class="form-group"><label>Data</label><input type="date" id="edit-data" value="${reg.data}"></div>
    `;
  } else {
    html += `
      <div class="form-group full-width"><label>Designação</label><input type="text" id="edit-desig" value="${escapeHtml(reg.designacao)}"></div>
      <div class="form-group"><label>Qtd/Emb</label><input type="number" id="edit-qtd" value="${reg.qtdEmbalagem}"></div>
      <div class="form-group"><label>Nº Emb</label><input type="number" id="edit-num" value="${reg.numEmbalagens}"></div>
      <div class="form-group"><label>Uso/dia</label><input type="number" id="edit-uso" value="${reg.usoDia}"></div>
      <div class="form-group"><label>Data</label><input type="date" id="edit-data" value="${reg.data}"></div>
    `;
  }
  html += `</div>`;
  body.innerHTML = html;
  
  document.getElementById('modal-save').onclick = async () => {
    const updates = { data: document.getElementById('edit-data').value };
    if (tipo === 'farmacia') {
      updates.nome = document.getElementById('edit-nome').value;
      updates.comprimidos = Number(document.getElementById('edit-comp').value);
      updates.ml = Number(document.getElementById('edit-ml').value);
      updates.ampolas = Number(document.getElementById('edit-amp').value);
      updates.tomas = Number(document.getElementById('edit-tomas').value);
      updates.duracao = Number(document.getElementById('edit-dur').value);
    } else {
      updates.designacao = document.getElementById('edit-desig').value;
      updates.qtdEmbalagem = Number(document.getElementById('edit-qtd').value);
      updates.numEmbalagens = Number(document.getElementById('edit-num').value);
      updates.usoDia = Number(document.getElementById('edit-uso').value);
    }
    try {
      await updateDoc(doc(db, tipo, id), updates);
      modal.classList.remove('open');
      showToast('Alterações guardadas.');
    } catch (e) { showToast('Erro ao guardar.'); }
  };
  
  modal.classList.add('open');
};

document.getElementById('modal-close').onclick = () => document.getElementById('modal-overlay').classList.remove('open');
document.getElementById('modal-cancel').onclick = () => document.getElementById('modal-overlay').classList.remove('open');

// ===== RELATÓRIOS =====
document.querySelectorAll('.report-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.report-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    relatorioTab = btn.dataset.rtab;
  });
});

function gerarRelatorio() {
  const checkboxes = document.querySelectorAll('#month-selector input[type="checkbox"]:checked');
  const mesesSelecionados = Array.from(checkboxes).map(cb => parseInt(cb.value));
  const ano = parseInt(document.getElementById('rel-ano').value);

  if (mesesSelecionados.length === 0) { showToast('Por favor, selecione pelo menos um mês.'); return; }
  if (!ano || ano < 2020) { showToast('Por favor, introduza um ano válido.'); return; }

  const output = document.getElementById('relatorio-output');
  let html = '';
  
  // Totais para o resumo abrangente
  let totalExcedenteComp = 0;
  let totalExcedenteFraldas = 0;
  let itensFarmacia = {};
  let itensHigiene = {};

  mesesSelecionados.forEach(mes => {
    const mesStr = String(mes).padStart(2, '0');
    const prefixo = `${ano}-${mesStr}`;
    const nomeMes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][mes - 1];
    const diasNoMes = new Date(ano, mes, 0).getDate();

    if (relatorioTab === 'farmacia' || relatorioTab === 'ambos') {
      const { html: bHtml, excedente } = calcularBlocoFarmacia(prefixo, nomeMes, ano, diasNoMes, itensFarmacia);
      html += bHtml;
      totalExcedenteComp += excedente;
    }
    if (relatorioTab === 'higiene' || relatorioTab === 'ambos') {
      const { html: bHtml, excedente } = calcularBlocoHigiene(prefixo, nomeMes, ano, diasNoMes, itensHigiene);
      html += bHtml;
      totalExcedenteFraldas += excedente;
    }
  });

  // Gerar resumo total se houver mais de um mês ou se houver dados
  let resumoHtml = `
    <div class="report-summary-total">
      <div class="summary-title">📊 Resumo Total do Período</div>
      <div class="report-stats-grid">
        <div class="report-stat highlight">
          <span class="stat-label">Total Comprimidos Excedentes</span>
          <span class="stat-value leftover">${totalExcedenteComp}</span>
        </div>
        <div class="report-stat highlight">
          <span class="stat-label">Total Fraldas/Cuecas Excedentes</span>
          <span class="stat-value leftover">${totalExcedenteFraldas}</span>
        </div>
      </div>
    </div>
  `;

  if (!html) {
    output.innerHTML = `<div class="report-empty"><span class="empty-icon">📊</span><p>Nenhum registo encontrado para os meses selecionados em <strong>${ano}</strong>.</p></div>`;
    document.getElementById('btn-exportar-relatorio').style.display = 'none';
    return;
  }

  output.innerHTML = resumoHtml + html;
  document.getElementById('btn-exportar-relatorio').style.display = 'inline-flex';
}

function calcularBlocoFarmacia(prefixo, nomeMes, ano, diasNoMes, acumulador) {
  const farmMes = farmaciaRegistos.filter(r => r.data && r.data.startsWith(prefixo));
  if (farmMes.length === 0) return { html: '', excedente: 0 };

  const grupos = {};
  farmMes.forEach(r => {
    const key = r.nome.toLowerCase().trim();
    if (!grupos[key]) grupos[key] = { nome: r.nome, registos: [] };
    grupos[key].registos.push(r);
  });

  let excedenteMes = 0;
  let html = `
    <div class="report-header-block report-header-farm">
      <h2 class="report-month-title">💊 Farmácia — ${nomeMes} ${ano}</h2>
      <p class="report-subtitle">${diasNoMes} dias no mês · ${farmMes.length} registo(s)</p>
    </div>`;

  Object.values(grupos).forEach(grupo => {
    let totalComp = 0, totalAmp = 0, totalMl = 0, tomasMax = 0, duracaoMax = 0;
    grupo.registos.forEach(r => {
      totalComp += r.comprimidos || 0;
      totalAmp  += r.ampolas    || 0;
      totalMl   += r.ml         || 0;
      if (r.tomas   > tomasMax)   tomasMax   = r.tomas;
      if (r.duracao > duracaoMax) duracaoMax = r.duracao;
    });
    const diasTrat = duracaoMax > 0 ? Math.min(duracaoMax, diasNoMes) : diasNoMes;
    const consComp = tomasMax > 0 ? Math.min(tomasMax * diasTrat, totalComp) : 0;
    const nConsComp = Math.max(0, totalComp - consComp);
    excedenteMes += nConsComp;

    html += `
      <div class="report-card">
        <div class="report-card-title">💊 ${escapeHtml(grupo.nome)}</div>
        <div class="report-card-body">
          <div class="report-stats-grid">
            <div class="report-stat"><span class="stat-label">Recebidos</span><span class="stat-value">${totalComp}</span></div>
            <div class="report-stat"><span class="stat-label">Consumidos</span><span class="stat-value consumed">${consComp}</span></div>
            <div class="report-stat highlight"><span class="stat-label">Excedente</span><span class="stat-value leftover">${nConsComp}</span></div>
          </div>
        </div>
      </div>`;
  });
  return { html, excedente: excedenteMes };
}

function calcularBlocoHigiene(prefixo, nomeMes, ano, diasNoMes, acumulador) {
  const higMes = higieneRegistos.filter(r => r.data && r.data.startsWith(prefixo));
  if (higMes.length === 0) return { html: '', excedente: 0 };

  const grupos = {};
  higMes.forEach(r => {
    const key = r.designacao.toLowerCase().trim();
    if (!grupos[key]) grupos[key] = { designacao: r.designacao, registos: [] };
    grupos[key].registos.push(r);
  });

  let excedenteMes = 0;
  let html = `
    <div class="report-header-block report-header-hig">
      <h2 class="report-month-title">🧴 Higiene — ${nomeMes} ${ano}</h2>
      <p class="report-subtitle">${diasNoMes} dias no mês · ${higMes.length} registo(s)</p>
    </div>`;

  Object.values(grupos).forEach(grupo => {
    let totalUnidades = 0, usoDiaMax = 0;
    grupo.registos.forEach(r => {
      totalUnidades += (r.qtdEmbalagem || 0) * (r.numEmbalagens || 0);
      if (r.usoDia > usoDiaMax) usoDiaMax = r.usoDia;
    });

    const consumidas = usoDiaMax > 0 ? Math.min(usoDiaMax * diasNoMes, totalUnidades) : 0;
    const nConsumidas = Math.max(0, totalUnidades - consumidas);
    excedenteMes += nConsumidas;

    html += `
      <div class="report-card">
        <div class="report-card-title report-card-title-hig">🧴 ${escapeHtml(grupo.designacao)}</div>
        <div class="report-card-body">
          <div class="report-stats-grid">
            <div class="report-stat"><span class="stat-label">Recebidas</span><span class="stat-value">${totalUnidades}</span></div>
            <div class="report-stat"><span class="stat-label">Consumidas</span><span class="stat-value consumed">${consumidas}</span></div>
            <div class="report-stat highlight"><span class="stat-label">Excedente</span><span class="stat-value leftover">${nConsumidas}</span></div>
          </div>
        </div>
      </div>`;
  });
  return { html, excedente: excedenteMes };
}

// ===== EXPORTAR PDF =====
document.getElementById('btn-exportar-relatorio').addEventListener('click', exportarPDF);

function exportarPDF() {
  const output = document.getElementById('relatorio-output');
  const ano = document.getElementById('rel-ano').value;
  
  const printHtml = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<title>Relatório Abrangente ${ano}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', Arial, sans-serif; background: #fff; color: #1e1e2e; font-size: 13px; line-height: 1.5; padding: 32px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .meta { color: #7a7a8c; font-size: 12px; margin-bottom: 24px; }
  .report-summary-total { border: 2px solid #c8602a; border-radius: 10px; padding: 20px; margin-bottom: 24px; }
  .summary-title { font-size: 18px; font-weight: 700; color: #c8602a; margin-bottom: 12px; }
  .report-header-block { background: #c8602a; color: #fff; border-radius: 10px; padding: 18px 24px; margin-bottom: 16px; margin-top: 24px; }
  .report-header-hig   { background: #0ea5e9; }
  .report-month-title  { font-size: 20px; font-weight: 700; margin-bottom: 2px; }
  .report-subtitle     { font-size: 12px; opacity: 0.85; }
  .report-card { border: 1px solid #e4e0d8; border-radius: 10px; margin-bottom: 16px; overflow: hidden; break-inside: avoid; }
  .report-card-title   { background: #f5e8e0; color: #c8602a; font-weight: 700; padding: 10px 18px; font-size: 13px; }
  .report-card-title-hig { background: #e0f2fe; color: #0369a1; }
  .report-card-body    { padding: 16px 18px; }
  .report-stats-grid   { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }
  .report-stat { background: #f8f8f8; border: 1px solid #e4e0d8; border-radius: 6px; padding: 10px 12px; }
  .report-stat.highlight { background: #fef3c7; border-color: #f59e0b; }
  .stat-label { font-size: 10px; font-weight: 600; color: #7a7a8c; text-transform: uppercase; display: block; }
  .stat-value { font-size: 18px; font-weight: 700; color: #1e1e2e; display: block; }
  .stat-value.consumed { color: #22c55e; }
  .stat-value.leftover { color: #f59e0b; }
  .footer { margin-top: 32px; font-size: 11px; color: #7a7a8c; border-top: 1px solid #e4e0d8; padding-top: 12px; text-align: right; }
</style>
</head>
<body>
  <h1>Relatório de Consumo — ${ano}</h1>
  <p class="meta">Gerado em ${new Date().toLocaleDateString('pt-PT')} · Gestão de Saúde</p>
  ${output.innerHTML}
  <div class="footer">Registos — Gestão de Saúde</div>
</body>
</html>`;

  const blob = new Blob([printHtml], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    win.addEventListener('load', () => {
      setTimeout(() => { win.print(); }, 400);
    });
  }
}

document.getElementById('btn-gerar-relatorio').addEventListener('click', gerarRelatorio);

// Pre-fill current month and year
const now = new Date();
const currentMonth = now.getMonth() + 1;
const monthCheckbox = document.querySelector(`#month-selector input[value="${currentMonth}"]`);
if (monthCheckbox) monthCheckbox.checked = true;
document.getElementById('rel-ano').value = now.getFullYear();

// ===== HELPERS =====
function limparFormFarmacia() {
  ['med-nome','med-comprimidos','med-ml','med-ampolas','med-tomas','med-duracao','med-data'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}
function limparFormHigiene() {
  ['hig-designacao','hig-qtd-embalagem','hig-num-embalagens','hig-uso-dia','hig-data'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}
function formatarData(str) {
  if (!str) return '—';
  const [ano, mes, dia] = str.split('-');
  return `${dia}/${mes}/${ano}`;
}
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

inicializarAutocompletes();
