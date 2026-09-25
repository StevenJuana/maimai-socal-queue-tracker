"use client";
import Image from "next/image";
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
  return <form action={signupAction} className="form-stack"><div className="field"><label htmlFor="display_name">Display name</label><input id="display_name" name="display_name" required maxLength={40} autoComplete="nickname" placeholder="How other players will see you"/><span className="muted" style={{fontSize:12}}>Display names must be unique, ignoring capitalization.</span></div><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email"/></div><div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" required minLength={8} autoComplete="new-password"/><span className="muted" style={{fontSize:12}}>Use at least 8 characters.</span></div><div className="field"><label htmlFor="screenshot">maimai profile screenshot</label><p className="muted upload-help">A screenshot is required for manual verification. You can find your maimai profile at <a className="profile-link" href="https://maimaidx-eng.com/" target="_blank" rel="noopener noreferrer">https://maimaidx-eng.com/</a>. An admin reviews it before you can submit queue/status updates. It is private to admins and removed after review.</p><input className="file-input" id="screenshot" name="screenshot" type="file" accept="image/jpeg,image/png,image/webp" required onChange={async (e) => { const input=e.currentTarget; const f = input.files?.[0]; if (!f) return; const shrunk = await compress(f); const dt = new DataTransfer(); dt.items.add(shrunk); input.files = dt.files; }}/><span className="muted upload-limit">JPEG, PNG, or WebP · Max 4MB after compression</span><div className="screenshot-example"><strong>Example: maimai profile screenshot</strong><Image src="/maimai-profile-example.png" alt="Example maimai profile screenshot" width={425} height={131} /></div></div><button className="primary-button" type="submit">Create account &amp; request verification</button></form>;
}
