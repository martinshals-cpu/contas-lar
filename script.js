import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

// ===== CONFIGURAÇÃO FIREBASE REAL =====
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

// ===== STATE =====
let farmaciaRegistos = [];
let higieneRegistos = [];

// ===== ESCUTA EM TEMPO REAL =====
const qFarmacia = query(collection(db, "farmacia"), orderBy("data", "desc"));
onSnapshot(qFarmacia, (snapshot) => {
  farmaciaRegistos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderFarmacia();
});

const qHigiene = query(collection(db, "higiene"), orderBy("data", "desc"));
onSnapshot(qHigiene, (snapshot) => {
  higieneRegistos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

// ===== EVENTOS DE LIMPEZA =====
document.getElementById('btn-limpar-farmacia').addEventListener('click', limparFormFarmacia);
document.getElementById('btn-limpar-higiene').addEventListener('click', limparFormHigiene);

// ===== FARMÁCIA FORM =====
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
    await addDoc(collection(db, "farmacia"), {
      nome,
      comprimidos: comprimidos || 0,
      ml: ml || 0,
      ampolas: ampolas || 0,
      data,
      timestamp: Date.now()
    });
    limparFormFarmacia();
    showToast('✓ Medicamento guardado na nuvem!');
  } catch (error) {
    showToast('Erro ao salvar no Firebase.');
  }
});

// ===== HIGIENE FORM =====
document.getElementById('form-higiene').addEventListener('submit', async function(e) {
  e.preventDefault();

  const designacao = document.getElementById('hig-designacao').value.trim();
  const qtdEmbalagem = document.getElementById('hig-qtd-embalagem').value;
  const numEmbalagens = document.getElementById('hig-num-embalagens').value;
  const data = document.getElementById('hig-data').value;

  if (!designacao) { showToast('Por favor, introduza a designação.'); return; }
  if (!data) { showToast('Por favor, introduza a data.'); return; }

  try {
    await addDoc(collection(db, "higiene"), {
      designacao,
      qtdEmbalagem: qtdEmbalagem || 0,
      numEmbalagens: numEmbalagens || 0,
      data,
      timestamp: Date.now()
    });
    limparFormHigiene();
    showToast('✓ Higiene guardado na nuvem!');
  } catch (error) {
    showToast('Erro ao salvar no Firebase.');
  }
});

// ===== RENDERIZAÇÃO =====
function renderFarmacia() {
  const list = document.getElementById('farm-list');
  const count = document.getElementById('farm-count');
  count.textContent = farmaciaRegistos.length + (farmaciaRegistos.length === 1 ? ' registo' : ' registos');

  if (farmaciaRegistos.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>Nenhum medicamento no Firebase.</p></div>`;
    return;
  }

  list.innerHTML = farmaciaRegistos.map(r => {
    const tags = [];
    if (r.comprimidos > 0) tags.push(`${r.comprimidos} comp.`);
    if (r.ml > 0) tags.push(`${r.ml} mL`);
    if (r.ampolas > 0) tags.push(`${r.ampolas} amp.`);

    return `
    <div class="record-card">
      <div class="record-main">
        <span class="record-name">💊 ${escapeHtml(r.nome)}</span>
        <div class="record-meta">${tags.map(t => `<span class="record-tag">${t}</span>`).join('')}</div>
      </div>
      <span class="record-date">${formatarData(r.data)}</span>
      <button class="btn-delete" data-id="${r.id}" data-type="farmacia">✕</button>
    </div>`;
  }).join('');
  
  adicionarEventosClique();
}

function renderHigiene() {
  const list = document.getElementById('hig-list');
  const count = document.getElementById('hig-count');
  count.textContent = higieneRegistos.length + (higieneRegistos.length === 1 ? ' registo' : ' registos');

  if (higieneRegistos.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>Nenhum artigo no Firebase.</p></div>`;
    return;
  }

  list.innerHTML = higieneRegistos.map(r => {
    const totalUnidades = r.qtdEmbalagem * r.numEmbalagens;
    return `
    <div class="record-card">
      <div class="record-main">
        <span class="record-name">🧴 ${escapeHtml(r.designacao)}</span>
        <div class="record-meta">
          <span class="record-tag">${r.qtdEmbalagem} un/emb.</span>
          ${totalUnidades > 0 ? `<span class="record-tag">Total: ${totalUnidades} un.</span>` : ''}
        </div>
      </div>
      <span class="record-date">${formatarData(r.data)}</span>
      <button class="btn-delete" data-id="${r.id}" data-type="higiene">✕</button>
    </div>`;
  }).join('');

  adicionarEventosClique();
}

// ===== DELETE (Firebase) =====
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

// ===== HELPERS & CLEANUP =====
function limparFormFarmacia() { document.querySelectorAll('#form-farmacia input').forEach(i => i.value = ''); }
function limparFormHigiene() { document.querySelectorAll('#form-higiene input').forEach(i => i.value = ''); }

function formatarData(str) {
  if (!str) return '—';
  const [ano, mes, dia] = str.split('-');
  return `${dia}/${mes}/${ano}`;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
