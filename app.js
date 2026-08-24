const demoAssets = [
  {id:'a1',name:'设备启动欢迎语',subtitle:'标准开机播报 · 默认语音',source:'preset',duration:8,size:.19,created:'2026-08-01',tag:'设备提醒',text:'设备已成功启动，欢迎使用华明新能源智能语音终端。'},
  {id:'a2',name:'安全生产温馨提示',subtitle:'园区安全 · 默认语音',source:'preset',duration:24,size:.54,created:'2026-08-01',tag:'安全播报',text:'安全生产，人人有责。请规范操作，注意作业安全。'},
  {id:'a3',name:'网络连接成功',subtitle:'系统状态 · 默认语音',source:'preset',duration:6,size:.12,created:'2026-08-01',tag:'设备提醒',text:'网络连接成功，设备状态正常。'},
  {id:'a4',name:'高温天气作业提醒',subtitle:'TTS 生成 · 女声温暖',source:'tts',duration:31,size:.81,created:'2026-08-05',tag:'安全播报',text:'今日天气炎热，请各位工作人员注意防暑降温，及时补充水分，合理安排户外作业时间。'},
  {id:'a5',name:'午间休息通知',subtitle:'人工上传 · 园区通知',source:'upload',duration:15,size:.43,created:'2026-08-04',tag:'日常通知',text:'午间休息时间已到，请大家合理安排休息。'},
  {id:'a6',name:'下班设备检查提醒',subtitle:'人工上传 · 设备管理',source:'upload',duration:11,size:.34,created:'2026-08-03',tag:'设备提醒',text:'下班前请关闭相关设备电源，并确认现场安全。'}
];

const initialQueue = [
  {id:'q1',assetId:'a1',time:'08:00'}, {id:'q2',assetId:'a2',time:'08:05'},
  {id:'q3',assetId:'a4',time:'11:30'}, {id:'q4',assetId:'a6',time:'17:30'}
];

const devices = Array.from({length:24},(_,index)=>({
  id:`HM-WH-A-${String(index+1).padStart(3,'0')}`,
  floor:12-Math.floor(index/2),
  online:[0,1,4,7,10,13,18,22].includes(index),
  name:`${12-Math.floor(index/2)}F-${index%2===0?'东侧':'西侧'}语音终端`
}));

const state = {
  assets: JSON.parse(localStorage.getItem('hm_assets') || 'null') || demoAssets,
  queue: JSON.parse(localStorage.getItem('hm_queue') || 'null') || initialQueue,
  filter:'all', search:'', sourceSearch:'', draggedId:null,
  plan: JSON.parse(localStorage.getItem('hm_plan') || 'null') || {name:'园区日常安全播报',date:new Date().toISOString().slice(0,10),mode:'按设定时间播放',status:'draft'}
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sourceNames = {preset:'系统预置',upload:'我的上传',tts:'TTS 生成'};
const geoMaps = {};
const formatTime = seconds => `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.round(seconds%60)).padStart(2,'0')}`;
const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function persist(){
  localStorage.setItem('hm_assets',JSON.stringify(state.assets.map(({url,...a})=>a)));
  localStorage.setItem('hm_queue',JSON.stringify(state.queue));
  localStorage.setItem('hm_plan',JSON.stringify(state.plan));
  $('#saveState').textContent='所有更改已保存';
}

function showToast(title,message){
  const toast=$('#toast'); toast.querySelector('strong').textContent=title; toast.querySelector('p').textContent=message;
  toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.classList.remove('show'),2600);
}

function navigate(view){
  $$('.view').forEach(v=>v.classList.remove('active')); $(`#${view}View`).classList.add('active');
  $$('.nav-item[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===view||(['city','building'].includes(view)&&n.dataset.view==='map')));
  $('#breadcrumbCurrent').textContent={map:'全国设备地图',city:'武汉市',building:'九万里人才基地',overview:'总览',assets:'语音素材',planner:'播放计划编排'}[view];
  $('.sidebar').classList.remove('open');
  requestAnimationFrame(()=>{
    window.dispatchEvent(new Event('resize'));
    const map=geoMaps[view]; if(map)setTimeout(()=>map.setCenter(map.getCenter()),80);
  });
}

function getMapConfig(){
  const fileConfig=window.HM_MAP_CONFIG||{};
  return {token:localStorage.getItem('hm_tianditu_token')||fileConfig.tiandituToken||''};
}

function showMapSetup(message='需要配置天地图浏览器端 Token 才能载入完整地图。'){
  ['chinaMap','wuhanMap'].forEach(id=>$(`#${id}`).innerHTML=`<div class="map-load-fallback"><div><span class="tianditu-logo">天地图</span><strong>地图服务等待配置</strong><small>${message}</small><button class="primary-btn map-config-trigger">配置天地图</button></div></div>`);
  $$('.map-config-trigger').forEach(button=>button.onclick=()=>openMapConfig());
}

function showLocalServerGuide(){
  const guide='<div class="map-load-fallback local-server-guide"><div><span class="protocol-badge">FILE://</span><strong>请通过本地服务器打开网页</strong><small>在线地图服务不支持直接双击 HTML 文件运行。请在项目目录启动 HTTP 服务，再访问 localhost。</small><code>python3 -m http.server 4173</code><button class="primary-btn copy-server-command">复制启动命令</button></div></div>';
  ['chinaMap','wuhanMap'].forEach(id=>$(`#${id}`).innerHTML=guide);
  $$('.copy-server-command').forEach(button=>button.onclick=async()=>{
    try{await navigator.clipboard.writeText('python3 -m http.server 4173');showToast('已复制','请在项目目录的终端中运行该命令。')}
    catch{showToast('启动命令','python3 -m http.server 4173')}
  });
}

function openMapConfig(){
  $('#tiandituToken').value=getMapConfig().token; openModal('mapConfigModal');
}

function loadTianditu(){
  const config=getMapConfig();
  if(!config.token){showMapSetup('请填写天地图浏览器端 Token，地图即可完整显示。');return Promise.reject(new Error('Tianditu token missing'))}
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('天地图加载超时')),15000);
    const script=document.createElement('script');
    script.src=`https://api.tianditu.gov.cn/api?v=4.0&tk=${encodeURIComponent(config.token)}`;
    script.onload=()=>{clearTimeout(timeout);window.T?resolve(window.T):reject(new Error('Tianditu API unavailable'))};
    script.onerror=()=>{clearTimeout(timeout);reject(new Error('天地图脚本加载失败'))};
    document.head.appendChild(script);
  });
}

function createDeviceMap(elementId,center,zoom,onMarkerClick){
  const point=new T.LngLat(center[0],center[1]);
  const map=new T.Map(elementId,{minZoom:3,maxZoom:18});
  map.centerAndZoom(point,zoom); map.enableScrollWheelZoom();
  [T.Control.Zoom,T.Control.Scale,T.Control.MapType].forEach(Control=>{if(Control)map.addControl(new Control())});
  const marker=new T.Marker(point,{title:elementId==='chinaMap'?'武汉市':'九万里人才基地'});
  marker.addEventListener('click',onMarkerClick); map.addOverlay(marker); return map;
}

async function initializeMaps(){
  if(location.protocol==='file:'){showLocalServerGuide();return}
  try{
    await loadTianditu();
    geoMaps.map=createDeviceMap('chinaMap',[114.3055,30.5928],5,()=>navigate('city'));
    geoMaps.city=createDeviceMap('wuhanMap',[114.3160,30.5440],14,()=>navigate('building'));
  }catch(error){if(getMapConfig().token)showMapSetup('地图载入失败：请确认 Token 已启用，并检查域名限制、调用配额和网络连接。')}
}

function renderDevices(){
  $('#tower').innerHTML=Array.from({length:12},(_,i)=>12-i).map(floor=>{
    const floorDevices=devices.filter(d=>d.floor===floor);
    return `<div class="floor" data-floor="${floor}"><span class="floor-label">${String(floor).padStart(2,'0')}F</span><div class="floor-devices">${floorDevices.map(d=>`<button class="device-node ${d.online?'online':''}" data-device="${d.id}" data-id="${d.id}" aria-label="打开设备 ${d.id}"></button>`).join('')}</div></div>`;
  }).join('');
  $('#deviceList').innerHTML=devices.map(d=>`<article class="device-card ${d.online?'online':'offline'}" data-device="${d.id}" data-status="${d.online?'online':'offline'}"><span class="device-status-icon">◉</span><div><strong>${d.id}</strong><small>${d.name}</small></div><span>${d.online?'在线':'离线'}</span></article>`).join('');
  $$('[data-device]').forEach(el=>el.onclick=()=>selectDevice(el.dataset.device));
}

function selectDevice(id){
  const device=devices.find(d=>d.id===id); if(!device)return;
  localStorage.setItem('hm_selected_device',id);
  $('#currentDeviceName').textContent=`${device.id} · 九万里人才基地 ${device.floor}F`;
  $('#deviceContext').classList.add('selected');
  navigate('assets');
  showToast('已选择目标设备',`${device.id} · ${device.floor}F，您可以准备并编排语音。`);
}

function updateMetrics(){
  const total=state.assets.reduce((n,a)=>n+a.duration,0), size=state.assets.reduce((n,a)=>n+a.size,0);
  $('#assetCount').textContent=`${state.assets.length} 个素材`; $('#assetSummary').textContent=`共 ${Math.floor(total/60)} 分 ${total%60} 秒 · ${size.toFixed(1)} MB`;
  ['preset','upload','tts'].forEach(k=>$(`#${k}Count`).textContent=state.assets.filter(a=>a.source===k).length);
  $('#assetNavCount').textContent=state.assets.length; $('#overviewAssetCount').textContent=state.assets.length; $('#overviewDuration').textContent=formatTime(total);
  $('#sourceCount').textContent=`${state.assets.length} 条可用`;
}

function renderAssets(){
  const term=state.search.toLowerCase();
  const shown=state.assets.filter(a=>(state.filter==='all'||a.source===state.filter)&&(`${a.name}${a.tag}${a.subtitle}`.toLowerCase().includes(term)));
  $('#assetList').innerHTML=shown.map(a=>`<tr>
    <td><div class="asset-name"><button class="play-mini" data-play="${a.id}" title="试听">▶</button><div><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.tag)} · MP3</small></div></div></td>
    <td><span class="source-label ${a.source}"><i></i>${sourceNames[a.source]}</span></td><td>${formatTime(a.duration)}</td><td>${a.created}</td><td><span class="ready">可使用</span></td>
    <td><div class="row-actions"><button data-add="${a.id}" title="加入计划">＋</button><button data-delete="${a.id}" title="删除">⋯</button></div></td></tr>`).join('');
  $('#assetEmpty').classList.toggle('show',!shown.length); bindDynamic(); updateMetrics(); renderSourceList();
}

function renderSourceList(){
  const term=state.sourceSearch.toLowerCase();
  const shown=state.assets.filter(a=>`${a.name}${a.tag}`.toLowerCase().includes(term));
  $('#sourceList').innerHTML=shown.map(a=>`<div class="source-item"><span class="sound-chip">♫</span><div><strong>${escapeHtml(a.name)}</strong><small>${formatTime(a.duration)} · ${escapeHtml(a.tag)}</small></div><button data-add="${a.id}" title="加入队列">＋</button></div>`).join('');
  bindDynamic();
}

function renderQueue(){
  $('#queueList').innerHTML=state.queue.map((q,index)=>{
    const a=state.assets.find(x=>x.id===q.assetId); if(!a)return '';
    return `<article class="queue-item" draggable="true" data-qid="${q.id}"><span class="drag-handle">⠿</span><span class="order-no">${String(index+1).padStart(2,'0')}</span><div class="queue-main"><strong>${escapeHtml(a.name)}</strong><small>${formatTime(a.duration)} · ${escapeHtml(a.tag)}</small></div><input class="time-input" type="time" value="${q.time}" data-time="${q.id}"><div class="queue-actions"><button data-pin="${q.id}" title="置顶">↑</button><button data-remove="${q.id}" title="移除">×</button></div></article>`;
  }).join('');
  $('#queueCount').textContent=state.queue.length; $('#queueEmpty').classList.toggle('show',!state.queue.length); $('#queueList').style.display=state.queue.length?'flex':'none';
  bindQueue();
}

function addToQueue(assetId){
  const last=state.queue.at(-1)?.time||'08:00'; const [h,m]=last.split(':').map(Number); const d=new Date(2000,0,1,h,m+5);
  state.queue.push({id:`q${Date.now()}`,assetId,time:`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`});
  renderQueue(); persist(); showToast('已加入播放计划','您可以前往播放计划调整顺序和时间。');
}

function bindDynamic(){
  $$('[data-play]').forEach(b=>b.onclick=()=>playAsset(b.dataset.play));
  $$('[data-add]').forEach(b=>b.onclick=()=>addToQueue(b.dataset.add));
  $$('[data-delete]').forEach(b=>b.onclick=()=>{
    const a=state.assets.find(x=>x.id===b.dataset.delete); if(!a||a.source==='preset'){showToast('系统素材已保护','系统预置语音不能删除。');return;}
    if(confirm(`确定删除“${a.name}”吗？`)){state.assets=state.assets.filter(x=>x.id!==a.id);state.queue=state.queue.filter(q=>q.assetId!==a.id);renderAssets();renderQueue();persist();}
  });
}

function bindQueue(){
  $$('.queue-item').forEach(item=>{
    item.ondragstart=()=>{state.draggedId=item.dataset.qid;item.classList.add('dragging')};
    item.ondragend=()=>{state.draggedId=null;item.classList.remove('dragging')};
    item.ondragover=e=>{e.preventDefault();const dragged=state.queue.findIndex(q=>q.id===state.draggedId),target=state.queue.findIndex(q=>q.id===item.dataset.qid);if(dragged!==target&&dragged>-1){const [moved]=state.queue.splice(dragged,1);state.queue.splice(target,0,moved);renderQueue();persist();}};
  });
  $$('[data-pin]').forEach(b=>b.onclick=()=>{const i=state.queue.findIndex(q=>q.id===b.dataset.pin);if(i>0)state.queue.unshift(state.queue.splice(i,1)[0]);renderQueue();persist();showToast('已置顶','该语音已移至待播放队列首位。')});
  $$('[data-remove]').forEach(b=>b.onclick=()=>{state.queue=state.queue.filter(q=>q.id!==b.dataset.remove);renderQueue();persist()});
  $$('[data-time]').forEach(i=>i.onchange=()=>{state.queue.find(q=>q.id===i.dataset.time).time=i.value;persist()});
}

function playAsset(id){
  const a=state.assets.find(x=>x.id===id); if(!a)return;
  $('#playerName').textContent=a.name; $('#playerMeta').textContent=`${sourceNames[a.source]} · ${a.tag}`; $('#playerDuration').textContent=formatTime(a.duration); $('#playerBar').classList.add('show');
  if(a.url){const audio=$('#audioElement');audio.src=a.url;audio.play();$('#playerToggle').textContent='Ⅱ';return;}
  speechSynthesis.cancel(); const utterance=new SpeechSynthesisUtterance(a.text||a.name);utterance.lang='zh-CN';utterance.rate=.9;utterance.onend=()=>$('#playerToggle').textContent='▶';speechSynthesis.speak(utterance);$('#playerToggle').textContent='Ⅱ';
}

function openModal(id){$(`#${id}`).classList.add('open');$(`#${id}`).setAttribute('aria-hidden','false')}
function closeModal(id){$(`#${id}`).classList.remove('open');$(`#${id}`).setAttribute('aria-hidden','true')}

$$('.nav-item[data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view)); $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
$('#openWuhan').onclick=()=>navigate('city'); $('#openSite').onclick=()=>navigate('building');
$$('[data-back]').forEach(b=>b.onclick=()=>navigate(b.dataset.back));
$$('[data-floor-filter]').forEach(b=>b.onclick=()=>{$$('[data-floor-filter]').forEach(x=>x.classList.toggle('active',x===b));$$('.device-card').forEach(card=>card.classList.toggle('hidden',b.dataset.floorFilter!=='all'&&card.dataset.status!==b.dataset.floorFilter))});
let buildingRotated=false; $('#rotateBuilding').onclick=()=>{buildingRotated=!buildingRotated;$('#tower').style.transform=`translate(-50%,-50%) rotateY(${buildingRotated?14:-9}deg) rotateX(2deg)`};
$('#resetBuilding').onclick=()=>{buildingRotated=false;$('#tower').style.transform='translate(-50%,-50%) rotateY(-9deg) rotateX(2deg)'};
$('#mobileMenu').onclick=()=>$('.sidebar').classList.toggle('open');
$('#assetTabs').onclick=e=>{if(!e.target.dataset.filter)return;state.filter=e.target.dataset.filter;$$('#assetTabs button').forEach(b=>b.classList.toggle('active',b===e.target));renderAssets()};
$('#assetSearch').oninput=e=>{state.search=e.target.value;renderAssets()}; $('#sourceSearch').oninput=e=>{state.sourceSearch=e.target.value;renderSourceList()};
$('#openUpload').onclick=()=>openModal('uploadModal'); $('#openTts').onclick=()=>openModal('ttsModal');
$('#saveMapConfig').onclick=()=>{
  const token=$('#tiandituToken').value.trim();
  if(!token){showToast('配置不完整','请输入天地图浏览器端 Token。');return}
  localStorage.setItem('hm_tianditu_token',token);location.reload();
};
$$('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close)); $$('.modal').forEach(m=>m.onclick=e=>{if(e.target===m)closeModal(m.id)});
$('#fileInput').onchange=e=>{const f=e.target.files[0];if(f){$('#selectedFile').textContent=`已选择：${f.name} · ${(f.size/1048576).toFixed(2)} MB`;$('#uploadName').value=f.name.replace(/\.mp3$/i,'')}};
$('#confirmUpload').onclick=()=>{
  const f=$('#fileInput').files[0],name=$('#uploadName').value.trim(); if(!f){showToast('请选择文件','仅支持 MP3 格式文件。');return}if(!name){showToast('请填写名称','素材名称不能为空。');return}if(f.size>20*1048576){showToast('文件过大','单个文件不能超过 20 MB。');return}
  const audio=new Audio(URL.createObjectURL(f)); audio.onloadedmetadata=()=>{state.assets.unshift({id:`a${Date.now()}`,name,subtitle:'人工上传 · 本次会话',source:'upload',duration:Math.round(audio.duration)||10,size:+(f.size/1048576).toFixed(2),created:new Date().toISOString().slice(0,10),tag:$('#uploadTag').value.trim()||$('#uploadCategory').value,text:'',url:audio.src});renderAssets();persist();closeModal('uploadModal');showToast('上传成功','新的 MP3 已加入语音素材库。');}; audio.onerror=()=>showToast('无法读取音频','请确认文件是有效的 MP3。');
};
$('#ttsText').oninput=e=>$('#charCount').textContent=`${e.target.value.length} / 300`;
$('#previewTts').onclick=()=>{const t=$('#ttsText').value.trim();if(!t){showToast('请输入播报文案','填写文字后即可试听。');return}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='zh-CN';u.rate=$('#ttsSpeed').value==='稍慢'?.75:$('#ttsSpeed').value==='稍快'?1.15:.9;speechSynthesis.speak(u)};
$('#createTts').onclick=()=>{const name=$('#ttsName').value.trim(),text=$('#ttsText').value.trim();if(!name||!text){showToast('请完善内容','素材名称和播报文案均不能为空。');return}state.assets.unshift({id:`a${Date.now()}`,name,subtitle:`TTS 生成 · ${$('#ttsVoice').value}`,source:'tts',duration:Math.max(3,Math.round(text.length/4)),size:+Math.max(.08,text.length*.006).toFixed(2),created:new Date().toISOString().slice(0,10),tag:'TTS 文案',text});renderAssets();persist();closeModal('ttsModal');showToast('文案已保存','已创建 TTS 素材，当前可使用浏览器试听。')};
$('#planName').value=state.plan.name;$('#planDate').value=state.plan.date;$('#planMode').value=state.plan.mode;
[$('#planName'),$('#planDate'),$('#planMode')].forEach(el=>el.oninput=()=>{$('#saveState').textContent='有未保存的更改';state.plan={...state.plan,name:$('#planName').value,date:$('#planDate').value,mode:$('#planMode').value}});
$('#saveDraft').onclick=()=>{persist();showToast('草稿已保存','播放顺序和计划设置已保存到本地。')};
$('#publishPlan').onclick=()=>{if(!state.queue.length){showToast('计划内容为空','请至少添加一条语音。');return}state.plan.status='published';persist();$('.plan-badge span').textContent='已发布';$('.plan-badge').style.background='#eaf8f0';showToast('计划已发布','当前演示阶段将等待设备同步模块接入。')};
$('#clearQueue').onclick=()=>{if(state.queue.length&&confirm('确定清空当前播放队列吗？')){state.queue=[];renderQueue();persist()}};
$('#addFirstAsset').onclick=()=>{if(state.assets[0])addToQueue(state.assets[0].id)};
$('#playerClose').onclick=()=>{speechSynthesis.cancel();$('#audioElement').pause();$('#playerBar').classList.remove('show')};
$('#playerToggle').onclick=()=>{const audio=$('#audioElement');if(audio.src){audio.paused?audio.play():audio.pause();$('#playerToggle').textContent=audio.paused?'▶':'Ⅱ'}};
$('#audioElement').ontimeupdate=e=>{const a=e.target;$('#playerProgress').style.width=`${a.duration?a.currentTime/a.duration*100:0}%`;$('#playerCurrent').textContent=formatTime(a.currentTime)};
$('#audioElement').onended=()=>$('#playerToggle').textContent='▶';

renderAssets(); renderQueue(); updateMetrics(); renderDevices(); initializeMaps();
const selectedDevice=localStorage.getItem('hm_selected_device'); if(selectedDevice){const d=devices.find(x=>x.id===selectedDevice);if(d){$('#currentDeviceName').textContent=`${d.id} · 九万里人才基地 ${d.floor}F`;$('#deviceContext').classList.add('selected')}}
