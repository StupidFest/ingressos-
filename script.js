const API_URL = "https://script.google.com/macros/s/AKfycbxwNW3U7h_28HqxWihMSVNAlAXi4LEK7lplh3oo5LobaCeanJgLElIYdtDnBpASYKPszw/exec";

function toBase64(file){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); }); }
function gerarCodigo(){ const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let code=""; for(let i=0;i<8;i++) code+=chars.charAt(Math.floor(Math.random()*chars.length)); return code; }

// ---------- Gerar ingresso ----------
document.getElementById('formTicket').addEventListener('submit', async e=>{
  e.preventDefault();
  const f=e.target;
  const nome=f.name.value.trim(); const valor=f.value.value.trim(); const tipo=f.type.value;
  if(!nome||!valor){ alert('Preencha nome e valor'); return; }
  const comprovanteFile=document.getElementById('comprovante').files[0];
  const comprovanteBase64 = comprovanteFile ? await toBase64(comprovanteFile) : '';
  const codigo = gerarCodigo();

  // gera PDF com jsPDF e QR
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:[148,105] });
  // fundo e texto
  doc.setFillColor(50,50,50); doc.rect(0,0,148,105,'F');
  doc.setFontSize(22); doc.setTextColor(255,255,255); doc.text(nome.toUpperCase(),74,25,{align:'center'});
  doc.setFontSize(12); doc.text(`VALOR: ${valor}`,74,40,{align:'center'});
  doc.text(`TIPO: ${tipo}`,74,48,{align:'center'});
  doc.text(`CÓDIGO: ${codigo}`,74,60,{align:'center'});

  // cria QR temporário
  const qrDiv=document.createElement('div'); qrDiv.style.position='absolute'; qrDiv.style.left='-9999px'; document.body.appendChild(qrDiv);
  new QRCode(qrDiv, { text: codigo, width: 90, height: 90 });
  await new Promise(r=>setTimeout(r,300));
  const canvas=await html2canvas(qrDiv); const imgData=canvas.toDataURL('image/png');
  document.body.removeChild(qrDiv);
  doc.addImage(imgData,'PNG',54,65,40,40);

  const pdfBase64 = doc.output('datauristring');

  // preview
  const prev = document.getElementById('preview');
  prev.innerHTML = `<div><strong>Código:</strong> ${codigo}</div><img src="${imgData}"></div>`;

  document.getElementById('generateStatus').innerText = 'Enviando...';

  // envia ao Apps Script
  try{
    const res = await fetch(API_URL,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'generate', name:nome, value:valor, type:tipo, comprovante:comprovanteBase64, pdfBase64:pdfBase64, codigo }) });
    const json = await res.json();
    if(json.ok){ document.getElementById('generateStatus').innerHTML = `Gerado! Código: <b>${json.codigo}</b><br><a href="${json.pdfUrl}" target="_blank">Abrir PDF no Drive</a>`; }
    else document.getElementById('generateStatus').innerText = 'Erro: ' + (json.error||json.message||'desconhecido');
  }catch(err){ document.getElementById('generateStatus').innerText = 'Erro de rede: ' + err; }
});

// ---------- Scanner / Validação ----------
let scanner = null;
const readerEl = document.getElementById('reader');
const scanResult = document.getElementById('scanResult');
document.getElementById('openScanner').addEventListener('click', startScanner);
document.getElementById('stopScanner').addEventListener('click', stopScanner);

function startScanner(){
  scanResult.innerHTML = '';
  readerEl.innerHTML = '<div style="color:#888">Abrindo câmera... permita acesso quando solicitado</div>';
  setTimeout(()=>{
    scanner = new Html5Qrcode('reader');
    Html5Qrcode.getCameras().then(devices=>{
      if(devices && devices.length){
        const back = devices.find(d=>/back|rear|environment/i.test(d.label)) || devices[0];
        scanner.start(back.id, { fps:10, qrbox:250 }, qrCodeSuccess, err=>{ /*ignore*/ }).then(()=>{ document.getElementById('stopScanner').style.display='inline-block'; }).catch(e=>{ scanResult.innerText = 'Erro ao iniciar câmera: ' + e; });
      }else{ scanResult.innerText='Nenhuma câmera detectada'; }
    }).catch(e=>{ scanResult.innerText='Erro ao listar câmeras: ' + e; });
  }, 500);
}

function stopScanner(){
  if(scanner){ scanner.stop().then(()=>{ scanner.clear(); scanner = null; document.getElementById('stopScanner').style.display='none'; readerEl.innerHTML=''; }).catch(()=>{}); }
}

async function qrCodeSuccess(decoded){
  // evita repetição
  stopScanner();
  scanResult.innerText = 'Lendo código...';
  try{
    const res = await fetch(API_URL,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'validate', codigo: decoded }) });
    const json = await res.json();
    if(json.ok && json.status==='OK'){ scanResult.innerHTML = `<div class="text-success"><b>VÁLIDO</b></div><div><b>${json.nome}</b><br>${json.tipo} — ${json.valor}</div>`; }
    else if(json.ok && json.status==='USADO'){ scanResult.innerHTML = `<div class="text-danger"><b>JÁ UTILIZADO</b></div><div>${json.message||''}</div>`; }
    else { scanResult.innerHTML = `<div class="text-warning"><b>Não encontrado</b></div><div>${json.message||'Código não encontrado'}</div>`; }
  }catch(e){ scanResult.innerText = 'Erro: ' + e; }
}
