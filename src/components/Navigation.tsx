import Link from "next/link";
import Image from "next/image";
import { CircleHelp, Gamepad2, LogIn, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/lib/actions";
export async function Navigation() {
  const supabase = await createClient(); const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  let isAdmin = false;
  if (supabase && user) { const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(); isAdmin = data?.role === "admin"; }
  return <><div className="topbar"><Link href="/" className="brand-row"><Image className="brand-logo" src="/maimai-queue-tracker-logo.png" alt="maimai Queue Tracker logo" width={45} height={45}/><span><span className="eyebrow">made by bagel</span><br/><strong style={{fontSize:14}}>SoCal maimai Queue Tracker</strong></span></Link><div className="top-actions">{isAdmin && <Link className="small-link" href="/admin">Admin</Link>}{user ? <form action={logoutAction}><button className="small-link" type="submit">Log out</button></form> : <Link className="small-link login-link" href="/login"><LogIn size={14}/> Log in</Link>}</div></div><nav className="bottom-nav" aria-label="Main navigation"><Link href="/" className="active"><Gamepad2/>Locations</Link>{user ? <Link href="/account"><ShieldCheck/>My account</Link> : <Link href="/signup"><LogIn/>Join to update</Link>}{isAdmin && <Link href="/admin"><ShieldCheck/>Reviews</Link>}<Link href="/help"><CircleHelp/>Help</Link></nav></>;
}
