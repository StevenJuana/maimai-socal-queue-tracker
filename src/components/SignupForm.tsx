"use client";
import { signupAction } from "@/lib/actions";
export function SignupForm() {
  async function compress(file: File) {
    if (!file.type.startsWith("image/")) return file;
    try {
      const bitmap = await createImageBitmap(file); const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return await new Promise<File>((resolve) => canvas.toBlob((blob) => resolve(blob ? new File([blob], "profile.jpg", { type: "image/jpeg" }) : file), "image/jpeg", .78));
    } catch { return file; }
  }
  return <form action={signupAction} className="form-stack" encType="multipart/form-data"><div className="field"><label htmlFor="display_name">Display name</label><input id="display_name" name="display_name" required maxLength={40} autoComplete="nickname" placeholder="How other players will see you"/></div><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email"/></div><div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" required minLength={8} autoComplete="new-password"/><span className="muted" style={{fontSize:12}}>Use at least 8 characters.</span></div><div className="field"><label htmlFor="screenshot">Maimai profile screenshot</label><input className="file-input" id="screenshot" name="screenshot" type="file" accept="image/jpeg,image/png,image/webp" required onChange={async (e) => { const input=e.currentTarget; const f = input.files?.[0]; if (!f) return; const shrunk = await compress(f); const dt = new DataTransfer(); dt.items.add(shrunk); input.files = dt.files; }}/><span className="muted" style={{fontSize:12}}>An admin will review this. The image is deleted after a decision. Max 4MB after compression.</span></div><button className="primary-button" type="submit">Create account &amp; request verification</button></form>;
}
