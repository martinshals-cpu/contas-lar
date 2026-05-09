import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

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

const sugestoes = {
  farmacia: { nome: new Set(), comprimidos: new Set(), ml: new Set(), ampolas: new Set() },
  higiene:  { designacao: new Set(), qtdEmbalagem: new Set(), numEmbalagens: new Set() }
};

// ===== AUTOCOMPLETE ENGINE =====
function criarAutocomplete(inputEl, getSugestoes) {
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

  function filtrar(valor) {
    const lista = Array.from(getSugestoes());
    const termo = valor.trim().toLowerCase();
    if (termo === '') return lista.slice(0, 8);
    return lista
      .filter(s => String(s).toLowerCase().includes(termo))
      .sort((a, b) => {
        const ai = String(a).toLowerCase().startsWith(termo) ? 0 : 1;
        const bi = String(b).toLowerCase().startsWith(termo) ? 0 : 1;
        return ai - bi || String(a).localeCompare(String(b));
      })
      .slice(0, 8);
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

function inicializarAutocompletes() {
  criarAutocomplete(document.getElementById('med-nome'), () => sugestoes.farmacia.nome);
  criarAutocomplete(document.getElementById('med-comprimidos'), () => sugestoes.farmacia.comprimidos);
  criarAutocomplete(document.getElementById('med-ml'), () => sugestoes.farmacia.ml);
  criarAutocomplete(document.getElementById('med-ampolas'), () => sugestoes.farmacia.ampolas);
  criarAutocomplete(document.getElementById('hig-designacao'), () => sugestoes.higiene.designacao);
  criarAutocomplete(document.getElementById('hig-qtd-embalagem'), () => sugestoes.higiene.qtdEmbalagem);
  criarAutocomplete(document.getElementById('hig-num-embalagens'), () => sugestoes.higiene.numEmbalagens);
}

function atualizarSugestoesFarmacia(registos) {
  sugestoes.farmacia.nome.clear();
  sugestoes.farmacia.comprimidos.clear();
  sugestoes.farmacia.ml.clear();
  sugestoes.farmacia.ampolas.clear();
  registos.forEach(r => {
    if (r.nome) sugestoes.farmacia.nome.add(r.nome);
    if (r.comprimidos > 0) sugestoes.farmacia.comprimidos.add(String(r.comprimidos));
    if (r.ml > 0) sugestoes.farmacia.ml.add(String(r.ml));
    if (r.ampolas > 0) sugestoes.farmacia.ampolas.add(String(r.ampolas));
  });
}

function atualizarSugestoesHigiene(registos) {
  sugestoes.higiene.designacao.clear();
  sugestoes.higiene.qtdEmbalagem.clear();
  sugestoes.higiene.numEmbalagens.clear();
  registos.forEach(r => {
    if (r.designacao) sugestoes.higiene.designacao.add(r.designacao);
    if (r.qtdEmbalagem > 0) sugestoes.higiene.qtdEmbalagem.add(String(r.qtdEmbalagem));
    if (r.numEmbalagens > 0) sugestoes.higiene.numEmbalagens.add(String(r.numEmbalagens));
  });
}

// ===== FIREBASE LISTENERS =====
const qFarmacia = query(collection(db, "farmacia"), orderBy("data", "desc"));
onSnapshot(qFarmacia, (snapshot) => {
  farmaciaRegistos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  atualizarSugestoesFarmacia(farmaciaRegistos);
  renderFarmacia();
});

const qHigiene = query(collection(db, "higiene"), orderBy("data", "desc"));
onSnapshot(qHigiene, (snapshot) => {
  higieneRegistos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  atualizarSugestoesHigiene(higieneRegistos);
  renderHigiene();
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

// ===== FORMS =====
document.getElementById('form-farmacia').addEventListener('submit', async function(e) {
  e.preventDefault();
  const nome = document.getElementById('med-nome').value.trim();
  const comprimidos = document.getElementById('med-comprimidos').value;
  const ml = document.getElementById('med-ml').value;
  const ampolas = document.getElementById('med-ampolas').value;
  const data = document.getElementById('med-data').value;
  if (!nome) { showToast('Por favor, introduza o nome do medicamento.'); return; }
  if (!data) { showToast('Por favor, introduza a data do recibo.'); return; }
  try {
    await addDoc(collection(db, "farmacia"), { nome, comprimidos: Number(comprimidos) || 0, ml: Number(ml) || 0, ampolas: Number(ampolas) || 0, data, timestamp: Date.now() });
    limparFormFarmacia();
    showToast('✓ Medicamento guardado na nuvem!');
  } catch (error) {
    showToast('Erro ao salvar no Firebase.');
  }
});

document.getElementById('form-higiene').addEventListener('submit', async function(e) {
  e.preventDefault();
  const designacao = document.getElementById('hig-designacao').value.trim();
  const qtdEmbalagem = document.getElementById('hig-qtd-embalagem').value;
  const numEmbalagens = document.getElementById('hig-num-embalagens').value;
  const data = document.getElementById('hig-data').value;
  if (!designacao) { showToast('Por favor, introduza a designação.'); return; }
  if (!data) { showToast('Por favor, introduza a data.'); return; }
  try {
    await addDoc(collection(db, "higiene"), { designacao, qtdEmbalagem: Number(qtdEmbalagem) || 0, numEmbalagens: Number(numEmbalagens) || 0, data, timestamp: Date.now() });
    limparFormHigiene();
    showToast('✓ Higiene guardado na nuvem!');
  } catch (error) {
    showToast('Erro ao salvar no Firebase.');
  }
});

// ===== RENDER =====
function renderFarmacia() {
  const list = document.getElementById('farm-list');
  const count = document.getElementById('farm-count');
  count.textContent = farmaciaRegistos.length + (farmaciaRegistos.length === 1 ? ' registo' : ' registos');
  if (farmaciaRegistos.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">💊</span><p>Nenhum medicamento registado ainda.</p></div>`;
    return;
  }
  list.innerHTML = farmaciaRegistos.map(r => {
    const tags = [];
    if (r.comprimidos > 0) tags.push(`${r.comprimidos} comp.`);
    if (r.ml > 0) tags.push(`${r.ml} mL`);
    if (r.ampolas > 0) tags.push(`${r.ampolas} amp.`);
    return `<div class="record-card"><div class="record-main"><span class="record-name">💊 ${escapeHtml(r.nome)}</span><div class="record-meta">${tags.map(t => `<span class="record-tag">${t}</span>`).join('')}</div></div><span class="record-date">${formatarData(r.data)}</span><button class="btn-delete" data-id="${r.id}" data-type="farmacia">✕</button></div>`;
  }).join('');
  adicionarEventosClique();
}

function renderHigiene() {
  const list = document.getElementById('hig-list');
  const count = document.getElementById('hig-count');
  count.textContent = higieneRegistos.length + (higieneRegistos.length === 1 ? ' registo' : ' registos');
  if (higieneRegistos.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">🧴</span><p>Nenhum artigo de higiene registado ainda.</p></div>`;
    return;
  }
  list.innerHTML = higieneRegistos.map(r => {
    const totalUnidades = r.qtdEmbalagem * r.numEmbalagens;
    return `<div class="record-card"><div class="record-main"><span class="record-name">🧴 ${escapeHtml(r.designacao)}</span><div class="record-meta"><span class="record-tag">${r.qtdEmbalagem} un/emb.</span><span class="record-tag">${r.numEmbalagens} emb.</span>${totalUnidades > 0 ? `<span class="record-tag">Total: ${totalUnidades} un.</span>` : ''}</div></div><span class="record-date">${formatarData(r.data)}</span><button class="btn-delete" data-id="${r.id}" data-type="higiene">✕</button></div>`;
  }).join('');
  adicionarEventosClique();
}

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
}

function limparFormFarmacia() {
  ['med-nome','med-comprimidos','med-ml','med-ampolas','med-data'].forEach(id => document.getElementById(id).value = '');
}
function limparFormHigiene() {
  ['hig-designacao','hig-qtd-embalagem','hig-num-embalagens','hig-data'].forEach(id => document.getElementById(id).value = '');
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
