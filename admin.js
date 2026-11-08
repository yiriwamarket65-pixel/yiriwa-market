import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const ADMIN_UID="9Y4RpeKwD8e8nGoZgiUuiz09mQt1";
const IMAGEKIT_PUBLIC_KEY="public_eKHo9it526HQAaPaRbQZjIbfYeo=";
const $=s=>document.querySelector(s), loginPanel=$("#login-panel"), dashboard=$("#dashboard"), loginError=$("#login-error");
let currentProducts=[], currentOrders=[];
const money=n=>`${Number(n||0).toLocaleString("fr-FR")} FCFA`;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function addFeatureStyles(){if(!document.querySelector('link[data-yiriwa-features]')){const l=document.createElement("link");l.rel="stylesheet";l.href="./features.css";l.dataset.yiriwaFeatures="1";document.head.append(l);}}
addFeatureStyles();

async function getUploadAuth(){
  const user=auth.currentUser;
  if(!user) throw new Error("Reconnectez-vous à l'administration.");
  const idToken=await user.getIdToken();
  const response=await fetch("/.netlify/functions/imagekit-auth",{method:"POST",headers:{Authorization:`Bearer ${idToken}`}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||"Authentification ImageKit impossible.");
  return data;
}
async function uploadImage(file){
  if(!file.type.startsWith("image/")) throw new Error("Choisissez uniquement des images.");
  if(file.size>8*1024*1024) throw new Error("Chaque image doit faire 8 Mo maximum.");
  const authData=await getUploadAuth();
  const body=new FormData();
  body.append("file",file);
  body.append("fileName",`yiriwa-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`);
  body.append("publicKey",IMAGEKIT_PUBLIC_KEY);
  body.append("token",authData.token);
  body.append("expire",String(authData.expire));
  body.append("signature",authData.signature);
  body.append("folder","/yiriwa-market/products");
  const response=await fetch("https://upload.imagekit.io/api/v1/files/upload",{method:"POST",body});
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.message||"Échec de l'envoi de la photo.");
  return result.url;
}
let sharedImages=[], pendingFiles=[];
function revokePending(){pendingFiles.forEach(x=>URL.revokeObjectURL(x.preview));pendingFiles=[];}
function revokeVariantPending(){document.querySelectorAll(".variant-row").forEach(row=>(row._variantFiles||[]).forEach(x=>URL.revokeObjectURL(x.preview)));}
function paintProductPhotos(){
 const box=$("#product-photo-previews");
 box.innerHTML=[...sharedImages.map((url,i)=>({url,kind:"saved",index:i})),...pendingFiles.map((x,i)=>({url:x.preview,kind:"pending",index:i}))].map(x=>`<div class="product-photo-card"><img src="${esc(x.url)}" alt="Aperçu de la photo"><button type="button" data-photo-kind="${x.kind}" data-photo-index="${x.index}" aria-label="Supprimer cette photo">×</button><small>${x.kind==="pending"?"Pas encore téléversée":"Déjà enregistrée"}</small></div>`).join("");
 box.querySelectorAll("[data-photo-kind]").forEach(b=>b.addEventListener("click",()=>{const i=Number(b.dataset.photoIndex);if(b.dataset.photoKind==="saved")sharedImages.splice(i,1);else{URL.revokeObjectURL(pendingFiles[i].preview);pendingFiles.splice(i,1);}paintProductPhotos();}));
 $("#photo-count").textContent=`${sharedImages.length+pendingFiles.length}/3 photos sélectionnées`;
}
$("#product-photos").addEventListener("change",e=>{
 const files=[...e.target.files],room=3-sharedImages.length-pendingFiles.length;
 if(files.length>room){alert(`Vous pouvez ajouter encore ${room} photo(s) maximum. Retirez d'abord une photo si nécessaire.`);e.target.value="";return;}
 for(const file of files){if(!file.type.startsWith("image/")){alert("Choisissez uniquement des images.");continue;}if(file.size>8*1024*1024){alert("Chaque image doit faire 8 Mo maximum.");continue;}pendingFiles.push({file,preview:URL.createObjectURL(file)});}
 e.target.value="";paintProductPhotos();
});
$("#clear-photos").addEventListener("click",()=>{sharedImages=[];revokePending();paintProductPhotos();});
function paintVariantPhotos(el){
 const box=el.querySelector(".variant-photo-previews");
 const urls=el._variantImages||[];
 box.innerHTML=urls.map((url,i)=>`<div class="variant-photo-thumb"><img src="${esc(url)}" alt="Photo de variante"><button type="button" data-index="${i}" aria-label="Retirer cette photo">×</button></div>`).join("")+
 (el._variantFiles||[]).map((item,i)=>`<div class="variant-photo-thumb"><img src="${esc(item.preview)}" alt="Aperçu de variante"><button type="button" data-pending="${i}" aria-label="Retirer cette photo">×</button></div>`).join("");
 box.querySelectorAll("[data-index]").forEach(b=>b.addEventListener("click",()=>{el._variantImages.splice(Number(b.dataset.index),1);paintVariantPhotos(el);}));
 box.querySelectorAll("[data-pending]").forEach(b=>b.addEventListener("click",()=>{const i=Number(b.dataset.pending);URL.revokeObjectURL(el._variantFiles[i].preview);el._variantFiles.splice(i,1);paintVariantPhotos(el);}));
 el.querySelector(".variant-photo-count").textContent=`${urls.length+(el._variantFiles||[]).length}/3 photos particulières`;
}
function variantRow(v={name:"",price:"",oldPrice:"",stock:1,promoEndsAt:"",available:true},customPhotos=false){
 const el=document.createElement("div");el.className="variant-row";
 el._variantImages=customPhotos&&Array.isArray(v.images)?v.images.slice(0,3):[];
 el._variantFiles=[];
 el.innerHTML=`<div class="variant-row-head"><b>Variante</b><button type="button" class="text-btn remove-variant">Supprimer cette variante</button></div>
 <label>Nom de la variante<input class="v-name" maxlength="60" required value="${esc(v.name)}" placeholder="Ex. Noir / 128 Go"></label>
 <div class="form-grid"><label>Prix (FCFA)<input class="v-price" type="number" min="0" step="1" required value="${esc(v.price)}"></label><label>Ancien prix (facultatif)<input class="v-old" type="number" min="0" step="1" value="${esc(v.oldPrice??"")}"></label></div>
 <div class="form-grid"><label>Stock<input class="v-stock" type="number" min="0" step="1" required value="${esc(v.stock)}"></label><label>Fin de promotion<input class="v-end" type="datetime-local" value="${esc(v.promoEndsAt||"")}"></label></div>
 <label class="check-row"><input class="v-available" type="checkbox" ${v.available===false?"":"checked"}> Disponible</label>
 <div class="variant-photo-picker"><div class="section-title"><div><b>Photos particulières à cette variante</b><small>Facultatif : sans photo ici, les photos principales seront utilisées.</small></div></div>
 <label class="variant-photo-select">＋ Choisir jusqu'à 3 photos<input class="v-photos" type="file" accept="image/*" multiple></label>
 <div class="variant-photo-previews"></div><small class="variant-photo-count">0/3 photos particulières</small>
 <button type="button" class="text-btn use-shared-photos">Utiliser les photos principales</button></div>`;
 el.querySelector(".v-photos").addEventListener("change",e=>{
  const files=[...e.target.files],room=3-el._variantImages.length-el._variantFiles.length;
  if(files.length>room){alert(`Vous pouvez ajouter encore ${room} photo(s) maximum pour cette variante.`);e.target.value="";return;}
  for(const file of files){if(!file.type.startsWith("image/")){alert("Choisissez uniquement des images.");continue;}if(file.size>8*1024*1024){alert("Chaque image doit faire 8 Mo maximum.");continue;}el._variantFiles.push({file,preview:URL.createObjectURL(file)});}
  e.target.value="";paintVariantPhotos(el);
 });
 el.querySelector(".use-shared-photos").addEventListener("click",()=>{el._variantImages=[];el._variantFiles.forEach(x=>URL.revokeObjectURL(x.preview));el._variantFiles=[];paintVariantPhotos(el);});
 el.querySelector(".remove-variant").addEventListener("click",()=>{el._variantFiles.forEach(x=>URL.revokeObjectURL(x.preview));el.remove();if(!document.querySelectorAll(".variant-row").length){$("#variant-editor").hidden=true;$("#simple-fields").hidden=false;$("#toggle-variants").setAttribute("aria-expanded","false");$("#toggle-variants").textContent="+ Ajouter des variantes";}});
 paintVariantPhotos(el);return el;
}
function addVariant(v,customPhotos=false){$("#variant-editor").append(variantRow(v,customPhotos));}
$("#toggle-variants").addEventListener("click",()=>{
 const box=$("#variant-editor");
 if(box.children.length){box.querySelectorAll(".variant-row").forEach(row=>(row._variantFiles||[]).forEach(x=>URL.revokeObjectURL(x.preview)));box.innerHTML="";box.hidden=true;$("#simple-fields").hidden=false;$("#toggle-variants").setAttribute("aria-expanded","false");$("#toggle-variants").textContent="+ Ajouter des variantes";return;}
 box.hidden=false;$("#simple-fields").hidden=true;$("#toggle-variants").setAttribute("aria-expanded","true");$("#toggle-variants").textContent="− Retirer les variantes";addVariant({name:"",price:"",oldPrice:"",stock:1,available:true});
});
$("#login-form").addEventListener("submit",async e=>{e.preventDefault();loginError.textContent="";try{await signInWithEmailAndPassword(auth,$("#email").value.trim(),$("#password").value);}catch(err){loginError.textContent="Connexion impossible. Vérifiez l'adresse e-mail et le mot de passe.";console.error(err);}});
$("#logout").addEventListener("click",()=>signOut(auth));
onAuthStateChanged(auth,user=>{if(user&&user.uid!==ADMIN_UID){loginError.textContent="Ce compte ne possède pas les droits administrateur.";signOut(auth);return;}loginPanel.hidden=!!user;dashboard.hidden=!user;if(user){loadProducts();loadOrders();loadStoreSettings();}});
async function loadProducts(){
 try{const snap=await getDocs(query(collection(db,"products"),orderBy("name")));currentProducts=snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.isSystem!==true);
 $("#admin-count").textContent=currentProducts.length;
 $("#admin-products").innerHTML=currentProducts.length?currentProducts.map(p=>{const v=Array.isArray(p.variants)&&p.variants.length?p.variants[0]:p;const imgs=Array.isArray(v.images)&&v.images.length?v.images:(v.imageUrl?[v.imageUrl]:[]);return `<article class="inventory-item"><div class="mini-image">${imgs[0]?`<img src="${esc(imgs[0])}" alt="">`:"YM"}</div><div class="inventory-details"><b>${esc(p.name)}</b><small>${esc(p.category||"Divers")} · ${p.variants?.length||1} version(s)</small><small>${p.available===false?"Masqué / indisponible":"Visible"}</small></div><div class="item-actions"><button class="text-btn edit-btn" data-id="${p.id}">Modifier</button><button class="text-btn delete-btn" data-id="${p.id}">Supprimer</button></div></article>`;}).join(""):`<p class="muted">Aucun produit pour le moment.</p>`;
 document.querySelectorAll(".edit-btn").forEach(b=>b.addEventListener("click",()=>editProduct(b.dataset.id)));document.querySelectorAll(".delete-btn").forEach(b=>b.addEventListener("click",()=>removeProduct(b.dataset.id)));
 }catch(e){console.error(e);$("#admin-products").innerHTML='<p class="error">Impossible de charger le catalogue. Vérifiez les règles Firestore.</p>';}
}
function editProduct(id){
 const p=currentProducts.find(x=>x.id===id);if(!p)return;
 $("#product-id").value=p.id;$("#p-name").value=p.name||"";$("#p-category").value=p.category||"";$("#p-description").value=p.description||"";
 const vs=Array.isArray(p.variants)&&p.variants.length?p.variants:[{name:"Standard",price:p.price??0,oldPrice:p.oldPrice??"",stock:p.stock??0,images:p.images||[],imageUrl:p.imageUrl||"",promoEndsAt:p.promoEndsAt||"",available:p.available!==false}];
 const first=vs[0],imgs=Array.isArray(first.images)&&first.images.length?first.images:(first.imageUrl?[first.imageUrl]:[]);
 sharedImages=imgs.slice(0,3);revokePending();paintProductPhotos();
 const hasVariants=vs.length>1||(vs.length===1&&vs[0].name&&vs[0].name!=="Standard");
 revokeVariantPending();$("#variant-editor").innerHTML="";$("#variant-editor").hidden=!hasVariants;$("#simple-fields").hidden=hasVariants;
 $("#toggle-variants").setAttribute("aria-expanded",String(hasVariants));$("#toggle-variants").textContent=hasVariants?"− Retirer les variantes":"+ Ajouter des variantes";
 $("#simple-price").value=first.price??0;$("#simple-old-price").value=first.oldPrice??"";$("#simple-stock").value=first.stock??0;$("#simple-end").value=first.promoEndsAt||"";$("#simple-available").checked=first.available!==false;
 if(hasVariants){const baseImages=imgs;vs.forEach(v=>{const vi=Array.isArray(v.images)?v.images:(v.imageUrl?[v.imageUrl]:[]);const custom=vi.length>0&&(vi.length!==baseImages.length||vi.some((url,i)=>url!==baseImages[i]));addVariant(v,custom);});}
 $("#form-title").textContent="Modifier le produit";$("#cancel-edit").hidden=false;$("#form-message").textContent="";window.scrollTo({top:0,behavior:"smooth"});
}
function resetForm(){
 revokeVariantPending();$("#product-form").reset();$("#product-id").value="";$("#variant-editor").innerHTML="";$("#variant-editor").hidden=true;$("#simple-fields").hidden=false;
 sharedImages=[];revokePending();paintProductPhotos();$("#toggle-variants").textContent="+ Ajouter des variantes";$("#toggle-variants").setAttribute("aria-expanded","false");
 $("#form-title").textContent="Ajouter un produit";$("#cancel-edit").hidden=true;
}
$("#cancel-edit").addEventListener("click",resetForm);
async function saveSharedPhotos(){
 const urls=[...sharedImages];
 for(let i=0;i<pendingFiles.length;i++){ $("#photo-upload-status").textContent=`Téléversement de la photo ${i+1}/${pendingFiles.length}…`;urls.push(await uploadImage(pendingFiles[i].file));}
 $("#photo-upload-status").textContent=urls.length?"Photos prêtes ✓":"Aucune photo ajoutée";return urls;
}
async function collectVariants(images){
 const rows=[...document.querySelectorAll(".variant-row")];
 if(!rows.length)return [{name:"Standard",price:Number($("#simple-price").value),oldPrice:$("#simple-old-price").value?Number($("#simple-old-price").value):null,stock:Number($("#simple-stock").value),promoEndsAt:$("#simple-end").value||null,images,imageUrl:images[0]||"",available:$("#simple-available").checked}];
 const variants=[];
 for(const row of rows){
  const ownImages=[...(row._variantImages||[])];
  for(let i=0;i<(row._variantFiles||[]).length;i++){ $("#photo-upload-status").textContent=`Téléversement des photos de variante (${variants.length+1}/${rows.length})…`;ownImages.push(await uploadImage(row._variantFiles[i].file));}
  const finalImages=ownImages.length?ownImages:images;
  variants.push({name:row.querySelector(".v-name").value.trim(),price:Number(row.querySelector(".v-price").value),oldPrice:row.querySelector(".v-old").value?Number(row.querySelector(".v-old").value):null,stock:Number(row.querySelector(".v-stock").value),promoEndsAt:row.querySelector(".v-end").value||null,images:finalImages,imageUrl:finalImages[0]||"",available:row.querySelector(".v-available").checked});
 }
 return variants;
}
$("#product-form").addEventListener("submit",async e=>{
 e.preventDefault();const id=$("#product-id").value,msg=$("#form-message");msg.classList.remove("error");msg.textContent="Préparation du produit…";
 try{const images=await saveSharedPhotos(),variants=await collectVariants(images);if(!variants.length)throw new Error("Ajoutez au moins une variante.");if(variants.some(v=>!v.name||!Number.isFinite(v.price)||v.price<0||!Number.isFinite(v.stock)||v.stock<0))throw new Error("Vérifiez le nom, le prix et le stock.");
 const data={name:$("#p-name").value.trim(),category:$("#p-category").value.trim(),description:$("#p-description").value.trim(),variants,updatedAt:serverTimestamp()};
 if(id)await updateDoc(doc(db,"products",id),data);else await addDoc(collection(db,"products"),{...data,createdAt:serverTimestamp()});
 msg.textContent="Produit enregistré avec succès.";resetForm();await loadProducts();
 }catch(err){console.error(err);msg.textContent=err.message||"Échec de l'enregistrement. Vérifiez votre connexion et les règles Firestore.";msg.classList.add("error");}
});
async function removeProduct(id){const p=currentProducts.find(x=>x.id===id);if(!p||!confirm(`Supprimer « ${p.name} » ?`))return;try{await deleteDoc(doc(db,"products",id));await loadProducts();}catch(e){alert("Suppression impossible. Vérifiez les autorisations.");console.error(e);}}
async function loadOrders(){try{const snap=await getDocs(query(collection(db,"orders"),orderBy("createdAt","desc")));currentOrders=snap.docs.map(d=>({id:d.id,...d.data()}));$("#orders-count").textContent=currentOrders.length;$("#admin-orders").innerHTML=currentOrders.length?currentOrders.map(o=>`<article class="order-item"><div><b>${esc(o.productName||"Produit")}</b><small>${esc(o.variantName||"Standard")} · ${money(o.unitPrice)} · Qté ${Number(o.quantity||1)}</small><small>${o.createdAt?.toDate?o.createdAt.toDate().toLocaleString("fr-FR"):"Date en attente"}</small></div><span class="order-status">${esc(o.status||"Nouvelle")}</span></article>`).join(""):`<p class="muted">Aucune commande pour le moment.</p>`;}catch(e){console.error(e);$("#admin-orders").innerHTML='<p class="error">Impossible de charger les commandes. Vérifiez les règles Firestore.</p>';}}
function injectSocialSettings(){
 if(document.querySelector("#store-settings"))return;
 const panel=document.createElement("section");panel.className="panel store-settings";panel.id="store-settings";
 panel.innerHTML=`<h3>Identité de la boutique</h3><p class="muted">Modifiez le nom affiché sur votre boutique sans toucher au code.</p>
 <form id="social-form"><label>Nom de la boutique<input id="store-name" type="text" maxlength="60" required placeholder="Yiriwa Market"></label>
 <h3>Coordonnées et réseaux sociaux</h3><p class="muted">Facultatif : seuls les liens renseignés seront visibles dans la boutique.</p>
 <label>Facebook<input id="social-facebook" type="url" placeholder="https://facebook.com/..."></label>
 <label>TikTok<input id="social-tiktok" type="url" placeholder="https://tiktok.com/@..."></label>
 <label>Instagram<input id="social-instagram" type="url" placeholder="https://instagram.com/..."></label>
 <label>Adresse e-mail professionnelle<input id="social-email" type="email" placeholder="contact@..."></label>
 <button class="btn btn-primary" type="submit">Enregistrer les coordonnées</button><p id="social-message" class="message"></p></form>`;
 $("#dashboard").append(panel);
 $("#social-form").addEventListener("submit",async e=>{e.preventDefault();const m=$("#social-message");m.textContent="Enregistrement…";try{await setDoc(doc(db,"settings","storefront"),{storeName:$("#store-name").value.trim()||"Yiriwa Market",facebook:$("#social-facebook").value.trim(),tiktok:$("#social-tiktok").value.trim(),instagram:$("#social-instagram").value.trim(),email:$("#social-email").value.trim(),updatedAt:serverTimestamp()},{merge:true});m.textContent="Nom et coordonnées enregistrés ✓";}catch(err){console.error(err);m.textContent="Enregistrement impossible. Vérifiez les règles Firestore.";m.classList.add("error");}});
}
async function loadStoreSettings(){injectSocialSettings();try{const snap=await getDoc(doc(db,"settings","storefront"));if(snap.exists()){const d=snap.data();$("#store-name").value=d.storeName||"Yiriwa Market";$("#social-facebook").value=d.facebook||"";$("#social-tiktok").value=d.tiktok||"";$("#social-instagram").value=d.instagram||"";$("#social-email").value=d.email||"";}}catch(e){console.warn("Lecture des coordonnées impossible",e);}}
resetForm();
