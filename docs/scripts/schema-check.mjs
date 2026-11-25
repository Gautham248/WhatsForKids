// Loads docs/schema.sql into PGlite (real Postgres in WASM) and exercises the gate, sweep and constraints.
// Run: npm i -D @electric-sql/pglite && node scripts/schema-check.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const db = new PGlite();
const sql = fs.readFileSync(new URL("../docs/schema.sql", import.meta.url),"utf8");
await db.exec(sql);
const q = async (s, label) => { try { const r = await db.query(s); console.log("ok  ", label, JSON.stringify(r.rows).slice(0,300)); } catch(e){ console.log("ERR ", label, e.message); } };
const x = async (s, label, expectFail) => { try { await db.exec(s); console.log(expectFail ? "BAD (should have failed)" : "ok  ", label); } catch(e){ console.log(expectFail ? "ok   (blocked)" : "ERR ", label, "->", e.message.slice(0,120)); } };

await x(`
INSERT INTO brand (id,name,url,platform) VALUES ('00000000-0000-0000-0000-000000000001','Oak','https://oak.example','shopify');
INSERT INTO brand_authorisation (brand_id,granted_on,expires_on) VALUES ('00000000-0000-0000-0000-000000000001', current_date - 10, current_date + 300);
INSERT INTO product (id,brand_id,source_url,name,price_paise,price_as_of,category_slug,age_min_months,age_max_months,material,short_description,status,suspended_reason)
 VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001','https://oak.example/p/stacker','Stacker',89900,current_date,'building',18,60,'Beech wood','ISI-marked wooden stacker.','discovered',NULL);
`, "insert brand+product");
await q(`SELECT key, ok, detail FROM publish_gate('00000000-0000-0000-0000-0000000000a1') WHERE NOT ok`, "gate failures before content");
await x(`UPDATE product SET status='published' WHERE id='00000000-0000-0000-0000-0000000000a1'`, "publish blocked by gate", true);
await x(`
INSERT INTO editorial_profile (product_id,version,state,intro,why_picked,drafted_by,approved_by,approved_at)
  SELECT id,1,'approved','A stacker.','Easy.','llm:x', u, now() FROM product, (SELECT NULL::uuid u) z WHERE false;
`, "noop");
await x(`
INSERT INTO app_user (id,google_sub,email,role) VALUES ('00000000-0000-0000-0000-0000000000f1','g1','a@x.com','approver');
INSERT INTO editorial_profile (product_id,version,state,intro,why_picked,drafted_by,approved_by,approved_at)
 VALUES ('00000000-0000-0000-0000-0000000000a1',1,'approved','A stacker.','Easy to start.','llm:x','00000000-0000-0000-0000-0000000000f1',now());
INSERT INTO reason_line (product_id,tag,text,approved_by,approved_at) VALUES
 ('00000000-0000-0000-0000-0000000000a1','age_fit','Fits.','00000000-0000-0000-0000-0000000000f1',now()),
 ('00000000-0000-0000-0000-0000000000a1','gift','Gift.','00000000-0000-0000-0000-0000000000f1',now()),
 ('00000000-0000-0000-0000-0000000000a1','budget','Budget.','00000000-0000-0000-0000-0000000000f1',now());
INSERT INTO purchase_route (product_id,url,kind,disclosure_text) VALUES ('00000000-0000-0000-0000-0000000000a1','https://oak.example/p/stacker','none','We have no commercial arrangement with this brand.');
`, "profile, reasons, route");
await q(`SELECT key, detail FROM publish_gate('00000000-0000-0000-0000-0000000000a1') WHERE NOT ok`, "gate failures (expect evidence only)");
await x(`UPDATE product SET status='published' WHERE id='00000000-0000-0000-0000-0000000000a1'`, "publish still blocked: no evidence", true);
await x(`
INSERT INTO evidence (product_id,claim_type,claim_text,issued_on,expires_on,approver_id,approved_at,status) VALUES
 ('00000000-0000-0000-0000-0000000000a1','age_suitability','Age 18m+','2026-01-01',NULL,'00000000-0000-0000-0000-0000000000f1',now(),'approved'),
 ('00000000-0000-0000-0000-0000000000a1','material','Beech','2026-01-01',NULL,'00000000-0000-0000-0000-0000000000f1',now(),'approved'),
 ('00000000-0000-0000-0000-0000000000a1','safety_cert','ISI licence','2026-01-01', current_date + 5,'00000000-0000-0000-0000-0000000000f1',now(),'approved');
`, "evidence");
await x(`UPDATE product SET status='published' WHERE id='00000000-0000-0000-0000-0000000000a1'`, "publish passes gate");
await q(`SELECT count(*) FROM product_visible`, "visible count (1)");
await q(`SELECT * FROM product_age_band`, "bands overlapped (0-2, 3-5)");
await x(`UPDATE evidence SET expires_on = current_date - 1 WHERE claim_type='safety_cert'`, "expire safety evidence");
await q(`SELECT count(*) FROM product_visible`, "visible count after expiry (0)");
await q(`SELECT * FROM sweep_catalogue()`, "sweep suspends");
await q(`SELECT status, suspended_reason FROM product`, "status after sweep");
await q(`SELECT version FROM catalogue_state`, "catalogue version bumped");
await x(`INSERT INTO history_entry (user_id,slots,product_ids) VALUES ('00000000-0000-0000-0000-0000000000f1','{"age":"3-5","raw":"my daughter Aisha"}','{}')`, "raw text key rejected", true);
await x(`INSERT INTO history_entry (user_id,slots,product_ids) VALUES ('00000000-0000-0000-0000-0000000000f1','{"age":"3-5","interests":["dinosaurs"]}','{}')`, "coded slots accepted");
await x(`INSERT INTO product (brand_id,source_url,name,price_paise,price_as_of,status) VALUES ('00000000-0000-0000-0000-000000000001','u2','n',100,current_date,'suspended')`, "suspended w/o reason rejected", true);
await x(`INSERT INTO purchase_route (product_id,url,kind,disclosure_text) VALUES ('00000000-0000-0000-0000-0000000000a1','https://b.example','none','second active route disclosure')`, "second active route rejected", true);
