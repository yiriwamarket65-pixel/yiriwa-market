import crypto from "node:crypto";

const ADMIN_UID = "9Y4RpeKwD8e8nGoZgiUuiz09mQt1";
const FIREBASE_API_KEY = "AIzaSyDDZnkXgnY41L8BZ_eId5XC_ldAd4xQ_iU";
const IMAGEKIT_PUBLIC_KEY = "public_eKHo9it526HQAaPaRbQZjIbfYeo=";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Méthode non autorisée", { status: 405 });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.replace(/^Bearer\s+/i, "");

    if (!idToken || idToken === authHeader) {
      return new Response("Authentification requise", { status: 401 });
    }

    const verification = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      }
    );

    const account = await verification.json();

    if (!verification.ok || account.users?.[0]?.localId !== ADMIN_UID) {
      return new Response("Accès refusé", { status: 403 });
    }

    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;

    if (!privateKey) {
      throw new Error("Clé privée ImageKit absente");
    }

    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 30 * 60;

    const signature = crypto
      .createHmac("sha1", privateKey)
      .update(token + expire)
      .digest("hex");

    return new Response(
      JSON.stringify({
        token,
        expire,
        signature,
        publicKey: IMAGEKIT_PUBLIC_KEY
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error(error);
    return new Response("Erreur du serveur", { status: 500 });
  }
};
