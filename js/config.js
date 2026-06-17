const SUPABASE_URL = "https://vbxvdljedlsjpgyqjkfd.supabase.co";
const SUPABASE_KEY = "sb_publishable_3C-wKp6WHzCx65vrg7Fh5g_0swQqLta";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "kdm2024admin";

const sb = async (path, options = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
    },
    ...options,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return text ? JSON.parse(text) : [];
};

const uploadImage = async (file) => {
  const ext = file.name.split(".").pop();
  const fileName = `${Date.now()}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/reports/${fileName}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("Upload failed");
  return `${SUPABASE_URL}/storage/v1/object/public/reports/${fileName}`;
};

const { useState, useEffect, useRef } = React;
const TABS = ["מסחר", "דיווחים", "צ'אט", "ארנק", "חברים", "חנות"];
const ADMIN_TABS = ["אישורים", "דיווחים", "שעות מסחר", "חנות", "משתמשים", "פקודות"];
