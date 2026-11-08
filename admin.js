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
function rowImages(row){try{return JSON.parse(row.dataset.images||"[]");}catch{return [];}}
function paintPreviews(row){
  const box=row.querySelector(".image-previews");
  const urls=rowImages(row);
  box.innerHTML=urls.map((url,i)=>`<div class="admin-photo-thumb"><img src="${esc(url)}" alt="Photo ${i+1}"><button type="button" data-remove-image="${i}" aria-label="Retirer la photo">×</button></div>`).join("");
  box.querySelectorAll("[data-remove-image]").forEach(b=>b.addEventListener("click",()=>{const a=rowImages(row);a.splice(Number(b.dataset.removeImage),1);row.dataset.images=JSON.stringify(a);paintPreviews(row);}));
  row.querySelector(".image-count").textContent=`${urls.length}/3 photo(s)`;
}
function variantRow(v={name:"Standard",price:"",oldPrice:"",stock:1,images:[],imageUrl:"",promoEndsAt:"",available:true}){
  const initial=Array.isArray(v.images)&&v.images.length?v.images:(v.imageUrl?[v.imageUrl]:[]);
  const el=document.createElement("div");el.className="variant-row";el.dataset.images=JSON.stringify(initial.slice(0,3));
  el.innerHTML=`<div class="variant-row-head"><b>Version</b><button type="button" class="text-btn remove-variant">Retirer</button></div>
  <label>Nom de la version<input class="v-name" maxlength="60" required value="${esc(v.name)}" placeholder="Ex. Noir / 128 Go"></label>
  <div class="form-grid"><label>Prix (FCFA)<input class="v-price" type="number" min="0" step="1" required value="${esc(v.price)}"></label><label>Ancien prix<input class="v-old" type="number" min="0" step="1" value="${esc(v.oldPrice??"")}"></label></div>
  <div class="form-grid"><label>Stock<input class="v-stock" type="number" min="0" step="1" required value="${esc(v.stock)}"></label><label>Fin de promotion<input class="v-end" type="datetime-local" value="${esc(v.promoEndsAt||"")}"></label></div>
  <label class="upload-label">Photos du produit (3 maximum)<input class="v-files" type="file" accept="image/*" multiple><small>Sélectionnez jusqu'à 3 images depuis votre téléphone. 8 Mo maximum par image.</small></label>
  <div class="image-previews"></div><small class="image-count"></small><p class="upload-status muted"></p>
  <label class="check-row"><input class="v-available" type="checkbox" ${v.available===false?"":"checked"}> Disponible</label>`;
  el.querySelector(".remove-variant").addEventListener("click",()=>{if(document.querySelectorAll(".variant-row").length>1)el.remove();else alert("Un produit doit garder au moins une version.");});
  el.querySelector(".v-files").addEventListener("change",e=>{
    const files=[...e.target.files];const current=rowImages(el);
    if(current.length+files.length>3){alert("Maximum 3 photos par version. Retirez une photo avant d'en ajouter.");e.target.value="";return;}
    el._newFiles=[...(el._newFiles||[]),...files];el.querySelector(".upload-status").textContent=`${el._newFiles.length} nouvelle(s) photo(s) prête(s) à envoyer.`;
    for(const f of files){const url=URL.createObjectURL(f);const im=document.createElement("img");im.src=url;im.alt="Aperçu";im.className="pending-preview";el.querySelector(".image-previews").append(im);}
    el.querySelector(".image-count").textContent=`${current.length+el._newFiles.length}/3 photo(s)`;
  });
  paintPreviews(el);return el;
}
function addVariant(v){$("#variant-editor").append(variantRow(v));}
$("#add-variant").addEventListener("click",()=>addVariant({name:"",price:"",oldPrice:"",stock:1,images:[],promoEndsAt:"",available:true}));
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
 const p=currentProducts.find(x=>x.id===id);if(!p)return;$("#product-id").value=p.id;$("#p-name").value=p.name||"";$("#p-category").value=p.category||"";$("#p-description").value=p.description||"";$("#variant-editor").innerHTML="";
 const vs=Array.isArray(p.variants)&&p.variants.length?p.variants:[{name:"Standard",price:p.price??0,oldPrice:p.oldPrice??"",stock:p.stock??0,imageUrl:p.imageUrl||"",images:p.images||[],promoEndsAt:p.promoEndsAt||"",available:p.available!==false}];vs.forEach(addVariant);
 $("#form-title").textContent="Modifier le produit";$("#cancel-edit").hidden=false;$("#form-message").textContent="";window.scrollTo({top:0,behavior:"smooth"});
}
function resetForm(){$("#product-form").reset();$("#product-id").value="";$("#variant-editor").innerHTML="";addVariant();$("#form-title").textContent="Ajouter un produit";$("#cancel-edit").hidden=true;}
$("#cancel-edit").addEventListener("click",resetForm);
async function collectVariants(){
 const rows=[...document.querySelectorAll(".variant-row")],out=[];
 for(let i=0;i<rows.length;i++){
  const row=rows[i],urls=rowImages(row),files=row._newFiles||[];
  if(urls.length+files.length>3)throw new Error("Maximum 3 photos par version.");
  for(let j=0;j<files.length;j++){row.querySelector(".upload-status").textContent=`Envoi de la photo ${j+1}/${files.length}…`;urls.push(await uploadImage(files[j]));}
  row.querySelector(".upload-status").textContent="Photos envoyées ✓";
  out.push({name:row.querySelector(".v-name").value.trim(),price:Number(row.querySelector(".v-price").value),oldPrice:row.querySelector(".v-old").value?Number(row.querySelector(".v-old").value):null,stock:Number(row.querySelector(".v-stock").value),promoEndsAt:row.querySelector(".v-end").value||null,images:urls,imageUrl:urls[0]||"",available:row.querySelector(".v-available").checked});
 }
 return out;
}
$("#product-form").addEventListener("submit",async e=>{
 e.preventDefault();const id=$("#product-id").value,msg=$("#form-message");msg.classList.remove("error");msg.textContent="Enregistrement…";
 try{const variants=await collectVariants();if(!variants.length)throw new Error("Ajoutez au moins une version.");const data={name:$("#p-name").value.trim(),category:$("#p-category").value.trim(),description:$("#p-description").value.trim(),variants,updatedAt:serverTimestamp()};
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
