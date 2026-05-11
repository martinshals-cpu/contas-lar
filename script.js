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
    // Se todos os valores forem numéricos, ordena por número crescente; senão alfabético
    const todosNumericos = lista.every(s => s !== '' && !isNaN(Number(s)));
    if (todosNumericos) {
      return lista.slice().sort((a, b) => Number(a) - Number(b));
    }
    return lista.slice().sort((a, b) => String(a).localeCompare(String(b), 'pt'));
  }

  function filtrar(valor) {
    const lista = Array.from(getSugestoes());
    const termo = valor.trim().toLowerCase();
    if (termo === '') {
      // Mostra todos ordenados (sem limite)
      return ordenar(lista);
    }
    // Com termo: filtra e ordena (starts-with primeiro, depois resto; sem limite)
    return lista
      .filter(s => String(s).toLowerCase().includes(termo))
      .sort((a, b) => {
        const ai = String(a).toLowerCase().startsWith(termo) ? 0 : 1;
        const bi = String(b).toLowerCase().startsWith(termo) ? 0 : 1;
        if (ai !== bi) return ai - bi;
        // dentro de cada grupo, mesma ordenação (numérica ou alfa)
        const todosNumericos = !isNaN(Number(a)) && !isNaN(Number(b));
        return todosNumericos
          ? Number(a) - Number(b)
          : String(a).localeCompare(String(b), 'pt');
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
  // farmaciaRegistos já está ordenado por data desc — o primeiro match é o mais recente
  const registo = farmaciaRegistos.find(r => r.nome && r.nome.trim().toLowerCase() === nomeLower);
  if (registo && registo.tomas > 0) {
    const tomasEl = document.getElementById('med-tomas');
    // Só preenche se o campo estiver vazio (não sobrescreve edição manual)
    if (!tomasEl.value) tomasEl.value = registo.tomas;
  }
}

function inicializarAutocompletes() {
  const nomeEl = document.getElementById('med-nome');
  criarAutocomplete(nomeEl,                                     () => sugestoes.farmacia.nome);
  criarAutocomplete(document.getElementById('med-comprimidos'), () => sugestoes.farmacia.comprimidos);
  criarAutocomplete(document.getElementById('med-ml'),          () => sugestoes.farmacia.ml);
  criarAutocomplete(document.getElementById('med-ampolas'),     () => sugestoes.farmacia.ampolas);
  criarAutocomplete(document.getElementById('med-tomas'),       () => sugestoes.farmacia.tomas);
  criarAutocomplete(document.getElementById('med-duracao'),     () => sugestoes.farmacia.duracao);
  criarAutocomplete(document.getElementById('hig-designacao'),    () => sugestoes.higiene.designacao);
  criarAutocomplete(document.getElementById('hig-qtd-embalagem'), () => sugestoes.higiene.qtdEmbalagem);
  criarAutocomplete(document.getElementById('hig-num-embalagens'),() => sugestoes.higiene.numEmbalagens);
  criarAutocomplete(document.getElementById('hig-uso-dia'),       () => sugestoes.higiene.usoDia);

  // Preencher tomas ao sair do campo nome (blur) ou ao selecionar via autocomplete
  nomeEl.addEventListener('blur', () => {
    setTimeout(() => preencherTomasDoMedicamento(nomeEl.value), 120);
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
    showToast('✓ Higiene guardado na nuvem!');
  } catch (error) {
    showToast('Erro ao salvar no Firebase.');
  }
});

// ===== RENDER FARMÁCIA =====
function renderFarmacia() {
  const list = document.getElementById('farm-list');
  const count = document.getElementById('farm-count');
  count.textContent = farmaciaRegistos.length + (farmaciaRegistos.length === 1 ? ' registo' : ' registos');
  if (farmaciaRegistos.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">💊</span><p>Nenhum medicamento registado ainda.</p></div>`;
    return;
  }
  list.innerHTML = farmaciaRegistos.map(r => farmCardHtml(r)).join('');
  adicionarEventosClique();
}

function farmCardHtml(r, showEdit = false) {
  const tags = [];
  if (r.comprimidos > 0) tags.push(`${r.comprimidos} comp.`);
  if (r.ml > 0)          tags.push(`${r.ml} mL`);
  if (r.ampolas > 0)     tags.push(`${r.ampolas} amp.`);
  if (r.tomas > 0)       tags.push(`${r.tomas}×/dia`);
  if (r.duracao > 0)     tags.push(`${r.duracao} dias`);
  return `
  <div class="record-card">
    <div class="record-main">
      <span class="record-name">💊 ${escapeHtml(r.nome)}</span>
      <div class="record-meta">${tags.map(t => `<span class="record-tag">${t}</span>`).join('')}</div>
    </div>
    <span class="record-date">${formatarData(r.data)}</span>
    ${showEdit ? `<button class="btn-edit" data-id="${r.id}" data-type="farmacia" title="Editar">✎</button>` : ''}
    <button class="btn-delete" data-id="${r.id}" data-type="farmacia" title="Eliminar">✕</button>
  </div>`;
}

// ===== RENDER HIGIENE =====
function renderHigiene() {
  const list = document.getElementById('hig-list');
  const count = document.getElementById('hig-count');
  count.textContent = higieneRegistos.length + (higieneRegistos.length === 1 ? ' registo' : ' registos');
  if (higieneRegistos.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">🧴</span><p>Nenhum artigo de higiene registado ainda.</p></div>`;
    return;
  }
  list.innerHTML = higieneRegistos.map(r => higCardHtml(r)).join('');
  adicionarEventosClique();
}

function higCardHtml(r, showEdit = false) {
  const totalUnidades = r.qtdEmbalagem * r.numEmbalagens;
  const tags = [];
  if (r.qtdEmbalagem > 0)  tags.push(`${r.qtdEmbalagem} un/emb.`);
  if (r.numEmbalagens > 0) tags.push(`${r.numEmbalagens} emb.`);
  if (totalUnidades > 0)   tags.push(`Total: ${totalUnidades} un.`);
  if (r.usoDia > 0)        tags.push(`${r.usoDia}×/dia`);
  return `
  <div class="record-card">
    <div class="record-main">
      <span class="record-name">🧴 ${escapeHtml(r.designacao)}</span>
      <div class="record-meta">${tags.map(t => `<span class="record-tag">${t}</span>`).join('')}</div>
    </div>
    <span class="record-date">${formatarData(r.data)}</span>
    ${showEdit ? `<button class="btn-edit" data-id="${r.id}" data-type="higiene" title="Editar">✎</button>` : ''}
    <button class="btn-delete" data-id="${r.id}" data-type="higiene" title="Eliminar">✕</button>
  </div>`;
}

// ===== RENDER TODOS OS REGISTOS =====
function renderTodos() {
  const list = document.getElementById('todos-list');
  let farmItems = farmaciaRegistos.map(r => farmCardHtml(r, true));
  let higItems = higieneRegistos.map(r => higCardHtml(r, true));

  let allItems = [];
  if (todosFilter === 'todos') {
    // Merge and sort by data desc
    const combined = [
      ...farmaciaRegistos.map(r => ({ ...r, _tipo: 'farmacia' })),
      ...higieneRegistos.map(r => ({ ...r, _tipo: 'higiene' }))
    ].sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.timestamp || 0) - (a.timestamp || 0));
    allItems = combined.map(r => r._tipo === 'farmacia' ? farmCardHtml(r, true) : higCardHtml(r, true));
  } else if (todosFilter === 'farmacia') {
    allItems = farmItems;
  } else {
    allItems = higItems;
  }

  if (allItems.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">📋</span><p>Nenhum registo encontrado.</p></div>`;
    return;
  }
  list.innerHTML = allItems.join('');
  adicionarEventosClique();
}

// ===== EDIT MODAL =====
const modalOverlay = document.getElementById('modal-overlay');
const modalBody = document.getElementById('modal-body');
const modalTitle = document.getElementById('modal-title');
let editingId = null;
let editingType = null;

function abrirModalEditar(id, tipo) {
  editingId = id;
  editingType = tipo;
  if (tipo === 'farmacia') {
    const r = farmaciaRegistos.find(x => x.id === id);
    if (!r) return;
    modalTitle.textContent = 'Editar Medicamento';
    modalBody.innerHTML = `
      <div class="form-grid">
        <div class="form-group full-width">
          <label>Nome do Medicamento</label>
          <input type="text" id="edit-nome" value="${escapeHtml(r.nome)}" />
        </div>
        <div class="form-group">
          <label>Nº de Comprimidos</label>
          <input type="number" id="edit-comprimidos" min="0" value="${r.comprimidos || 0}" />
        </div>
        <div class="form-group">
          <label>Quantidade (mL)</label>
          <input type="number" id="edit-ml" min="0" step="0.1" value="${r.ml || 0}" />
        </div>
        <div class="form-group">
          <label>Nº de Ampolas</label>
          <input type="number" id="edit-ampolas" min="0" value="${r.ampolas || 0}" />
        </div>
        <div class="form-group">
          <label>Nº de Tomas/Dia</label>
          <input type="number" id="edit-tomas" min="0" value="${r.tomas || 0}" />
        </div>
        <div class="form-group">
          <label>Duração do Tratamento (dias)</label>
          <input type="number" id="edit-duracao" min="0" value="${r.duracao || 0}" />
        </div>
        <div class="form-group">
          <label>Data do Recibo</label>
          <input type="date" id="edit-data" value="${r.data || ''}" />
        </div>
      </div>`;
  } else {
    const r = higieneRegistos.find(x => x.id === id);
    if (!r) return;
    modalTitle.textContent = 'Editar Artigo de Higiene';
    modalBody.innerHTML = `
      <div class="form-grid">
        <div class="form-group full-width">
          <label>Designação</label>
          <input type="text" id="edit-designacao" value="${escapeHtml(r.designacao)}" />
        </div>
        <div class="form-group">
          <label>Quantidade por Embalagem</label>
          <input type="number" id="edit-qtd-embalagem" min="0" value="${r.qtdEmbalagem || 0}" />
        </div>
        <div class="form-group">
          <label>Nº de Embalagens</label>
          <input type="number" id="edit-num-embalagens" min="0" value="${r.numEmbalagens || 0}" />
        </div>
        <div class="form-group">
          <label>Nº de Uso/Dia</label>
          <input type="number" id="edit-uso-dia" min="0" value="${r.usoDia || 0}" />
        </div>
        <div class="form-group">
          <label>Data</label>
          <input type="date" id="edit-data-hig" value="${r.data || ''}" />
        </div>
      </div>`;
  }
  modalOverlay.classList.add('open');
}

function fecharModal() {
  modalOverlay.classList.remove('open');
  editingId = null;
  editingType = null;
}

document.getElementById('modal-close').addEventListener('click', fecharModal);
document.getElementById('modal-cancel').addEventListener('click', fecharModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) fecharModal(); });

document.getElementById('modal-save').addEventListener('click', async () => {
  if (!editingId || !editingType) return;
  try {
    if (editingType === 'farmacia') {
      const nome = document.getElementById('edit-nome').value.trim();
      if (!nome) { showToast('Nome obrigatório.'); return; }
      await updateDoc(doc(db, 'farmacia', editingId), {
        nome,
        comprimidos: Number(document.getElementById('edit-comprimidos').value) || 0,
        ml:          Number(document.getElementById('edit-ml').value) || 0,
        ampolas:     Number(document.getElementById('edit-ampolas').value) || 0,
        tomas:       Number(document.getElementById('edit-tomas').value) || 0,
        duracao:     Number(document.getElementById('edit-duracao').value) || 0,
        data:        document.getElementById('edit-data').value,
      });
    } else {
      const designacao = document.getElementById('edit-designacao').value.trim();
      if (!designacao) { showToast('Designação obrigatória.'); return; }
      await updateDoc(doc(db, 'higiene', editingId), {
        designacao,
        qtdEmbalagem:  Number(document.getElementById('edit-qtd-embalagem').value) || 0,
        numEmbalagens: Number(document.getElementById('edit-num-embalagens').value) || 0,
        usoDia:        Number(document.getElementById('edit-uso-dia').value) || 0,
        data:          document.getElementById('edit-data-hig').value,
      });
    }
    fecharModal();
    showToast('✓ Registo atualizado!');
  } catch (e) {
    showToast('Erro ao atualizar registo.');
  }
});

// ===== DELETE =====
async function eliminarDocumento(id, tipo) {
  if (confirm("Deseja eliminar este registo permanentemente?")) {
    try {
      await deleteDoc(doc(db, tipo, id));
      showToast('Registo eliminado da nuvem.');
    } catch (e) {
      showToast('Erro ao eliminar.');
    }
  }
}

function adicionarEventosClique() {
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.onclick = () => eliminarDocumento(btn.getAttribute('data-id'), btn.getAttribute('data-type'));
  });
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.onclick = () => abrirModalEditar(btn.getAttribute('data-id'), btn.getAttribute('data-type'));
  });
}

// ===== RELATÓRIOS MENSAIS =====
let relatorioTab = 'farmacia';

document.querySelectorAll('.report-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.report-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    relatorioTab = btn.dataset.rtab;
  });
});

function gerarRelatorio() {
  const mes = parseInt(document.getElementById('rel-mes').value);
  const ano = parseInt(document.getElementById('rel-ano').value);
  if (!ano || ano < 2020) { showToast('Por favor, introduza um ano válido.'); return; }

  const mesStr  = String(mes).padStart(2, '0');
  const prefixo = `${ano}-${mesStr}`;
  const nomeMes = document.getElementById('rel-mes').options[mes - 1].text;
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const output  = document.getElementById('relatorio-output');

  let html = '';

  if (relatorioTab === 'farmacia' || relatorioTab === 'ambos') {
    html += gerarBlocoFarmacia(prefixo, nomeMes, ano, diasNoMes);
  }
  if (relatorioTab === 'higiene' || relatorioTab === 'ambos') {
    html += gerarBlocoHigiene(prefixo, nomeMes, ano, diasNoMes);
  }

  if (!html) {
    output.innerHTML = `<div class="report-empty"><span class="empty-icon">📊</span><p>Nenhum registo encontrado para <strong>${nomeMes} ${ano}</strong>.</p></div>`;
    document.getElementById('btn-exportar-relatorio').style.display = 'none';
    return;
  }

  output.innerHTML = html;
  document.getElementById('btn-exportar-relatorio').style.display = 'inline-flex';
}

function gerarBlocoFarmacia(prefixo, nomeMes, ano, diasNoMes) {
  const farmMes = farmaciaRegistos.filter(r => r.data && r.data.startsWith(prefixo));
  if (farmMes.length === 0) return `<div class="report-empty"><span class="empty-icon">💊</span><p>Nenhum registo de farmácia para <strong>${nomeMes} ${ano}</strong>.</p></div>`;

  const grupos = {};
  farmMes.forEach(r => {
    const key = r.nome.toLowerCase().trim();
    if (!grupos[key]) grupos[key] = { nome: r.nome, registos: [] };
    grupos[key].registos.push(r);
  });

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
    const consAmp  = tomasMax > 0 ? Math.min(tomasMax * diasTrat, totalAmp)  : 0;
    const nConsComp = Math.max(0, totalComp - consComp);
    const nConsAmp  = Math.max(0, totalAmp  - consAmp);

    html += `
      <div class="report-card">
        <div class="report-card-title">💊 ${escapeHtml(grupo.nome)}</div>
        <div class="report-card-body">
          <div class="report-stats-grid">
            ${totalComp > 0 ? `
            <div class="report-stat"><span class="stat-label">Comprimidos recebidos</span><span class="stat-value">${totalComp}</span></div>
            <div class="report-stat"><span class="stat-label">Comprimidos consumidos</span><span class="stat-value consumed">${consComp}</span></div>
            <div class="report-stat ${nConsComp > 0 ? 'highlight' : ''}"><span class="stat-label">Não consumidos</span><span class="stat-value leftover">${nConsComp}</span></div>` : ''}
            ${totalAmp > 0 ? `
            <div class="report-stat"><span class="stat-label">Ampolas recebidas</span><span class="stat-value">${totalAmp}</span></div>
            <div class="report-stat"><span class="stat-label">Ampolas consumidas</span><span class="stat-value consumed">${consAmp}</span></div>
            <div class="report-stat ${nConsAmp > 0 ? 'highlight' : ''}"><span class="stat-label">Não consumidas</span><span class="stat-value leftover">${nConsAmp}</span></div>` : ''}
            ${totalMl > 0 ? `<div class="report-stat"><span class="stat-label">Total (mL)</span><span class="stat-value">${totalMl} mL</span></div>` : ''}
          </div>
          <div class="report-detail-line">
            <span>Tomas/dia: <strong>${tomasMax || '—'}</strong></span>
            <span>Duração: <strong>${duracaoMax > 0 ? duracaoMax + ' dias' : '—'}</strong></span>
            <span>Dias considerados: <strong>${diasTrat}</strong></span>
          </div>
          ${duracaoMax > 0 && tomasMax > 0 ? buildProgressBar(consComp || consAmp, totalComp || totalAmp) : ''}
        </div>
      </div>`;
  });
  return html;
}

function gerarBlocoHigiene(prefixo, nomeMes, ano, diasNoMes) {
  const higMes = higieneRegistos.filter(r => r.data && r.data.startsWith(prefixo));
  if (higMes.length === 0) return `<div class="report-empty"><span class="empty-icon">🧴</span><p>Nenhum registo de higiene para <strong>${nomeMes} ${ano}</strong>.</p></div>`;

  const grupos = {};
  higMes.forEach(r => {
    const key = r.designacao.toLowerCase().trim();
    if (!grupos[key]) grupos[key] = { designacao: r.designacao, registos: [] };
    grupos[key].registos.push(r);
  });

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

    // Consumed = uso/dia × diasNoMes
    const consumidas   = usoDiaMax > 0 ? Math.min(usoDiaMax * diasNoMes, totalUnidades) : 0;
    const nConsumidas  = Math.max(0, totalUnidades - consumidas);
    const pct = totalUnidades > 0 ? Math.min(100, Math.round((consumidas / totalUnidades) * 100)) : 0;

    html += `
      <div class="report-card">
        <div class="report-card-title report-card-title-hig">🧴 ${escapeHtml(grupo.designacao)}</div>
        <div class="report-card-body">
          <div class="report-stats-grid">
            <div class="report-stat"><span class="stat-label">Unidades recebidas</span><span class="stat-value">${totalUnidades}</span></div>
            <div class="report-stat"><span class="stat-label">Unidades consumidas</span><span class="stat-value consumed">${consumidas}</span></div>
            <div class="report-stat ${nConsumidas > 0 ? 'highlight' : ''}"><span class="stat-label">Não consumidas</span><span class="stat-value leftover">${nConsumidas}</span></div>
          </div>
          <div class="report-detail-line">
            <span>Uso/dia: <strong>${usoDiaMax || '—'}</strong></span>
            <span>Dias no mês: <strong>${diasNoMes}</strong></span>
            <span>Stock estimado restante: <strong>${nConsumidas} un.</strong></span>
          </div>
          ${usoDiaMax > 0 ? buildProgressBar(consumidas, totalUnidades) : ''}
        </div>
      </div>`;
  });
  return html;
}

function buildProgressBar(consumed, total) {
  if (!total) return '';
  const pct = Math.min(100, Math.round((consumed / total) * 100));
  return `
    <div class="report-progress-wrap">
      <div class="report-progress-bar"><div class="report-progress-fill" style="width:${pct}%"></div></div>
      <span class="report-progress-label">${pct}% consumido</span>
    </div>`;
}

// ===== EXPORTAR PDF =====
document.getElementById('btn-exportar-relatorio').addEventListener('click', exportarPDF);

function exportarPDF() {
  const mes     = parseInt(document.getElementById('rel-mes').value);
  const ano     = parseInt(document.getElementById('rel-ano').value);
  const nomeMes = document.getElementById('rel-mes').options[mes - 1].text;
  const output  = document.getElementById('relatorio-output');

  const printHtml = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<title>Relatório ${nomeMes} ${ano}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', Arial, sans-serif; background: #fff; color: #1e1e2e; font-size: 13px; line-height: 1.5; padding: 32px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .meta { color: #7a7a8c; font-size: 12px; margin-bottom: 24px; }
  .report-header-block { background: #c8602a; color: #fff; border-radius: 10px; padding: 18px 24px; margin-bottom: 16px; }
  .report-header-hig   { background: #0ea5e9; }
  .report-month-title  { font-size: 20px; font-weight: 700; margin-bottom: 2px; }
  .report-subtitle     { font-size: 12px; opacity: 0.85; }
  .report-card { border: 1px solid #e4e0d8; border-radius: 10px; margin-bottom: 16px; overflow: hidden; break-inside: avoid; }
  .report-card-title   { background: #f5e8e0; color: #c8602a; font-weight: 700; padding: 10px 18px; font-size: 13px; }
  .report-card-title-hig { background: #e0f2fe; color: #0369a1; }
  .report-card-body    { padding: 16px 18px; }
  .report-stats-grid   { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 12px; }
  .report-stat { background: #f8f8f8; border: 1px solid #e4e0d8; border-radius: 6px; padding: 10px 12px; }
  .report-stat.highlight { background: #fef3c7; border-color: #f59e0b; }
  .stat-label { font-size: 10px; font-weight: 600; color: #7a7a8c; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 2px; }
  .stat-value { font-size: 20px; font-weight: 700; color: #1e1e2e; display: block; }
  .stat-value.consumed { color: #22c55e; }
  .stat-value.leftover { color: #f59e0b; }
  .report-detail-line  { display: flex; gap: 20px; font-size: 11px; color: #7a7a8c; margin-bottom: 10px; flex-wrap: wrap; }
  .report-detail-line strong { color: #1e1e2e; }
  .report-progress-wrap { display: flex; align-items: center; gap: 10px; }
  .report-progress-bar  { flex: 1; background: #e4e0d8; border-radius: 99px; height: 7px; overflow: hidden; }
  .report-progress-fill { height: 100%; background: #22c55e; border-radius: 99px; }
  .report-progress-label { font-size: 11px; font-weight: 600; color: #7a7a8c; white-space: nowrap; }
  .report-empty { text-align: center; padding: 32px; color: #7a7a8c; }
  .footer { margin-top: 32px; font-size: 11px; color: #7a7a8c; border-top: 1px solid #e4e0d8; padding-top: 12px; text-align: right; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
  <h1>Relatório Mensal — ${nomeMes} ${ano}</h1>
  <p class="meta">Gerado em ${new Date().toLocaleDateString('pt-PT', { day:'2-digit', month:'long', year:'numeric' })} · Gestão de Saúde AMHM</p>
  ${output.innerHTML}
  <div class="footer">Registos — Gestão de Saúde · BY AMHM</div>
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

// Pre-fill current month/year
const now = new Date();
document.getElementById('rel-mes').value = now.getMonth() + 1;
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
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

inicializarAutocompletes();
