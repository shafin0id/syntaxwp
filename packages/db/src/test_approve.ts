async function main() {
  const incidentId = "6ab4ae2f-5fed-4ecc-a5b2-61d2e1712088";
  const url = `http://localhost:4000/api/incidents/${incidentId}/approve`;
  console.log("Sending POST to:", url);
  try {
    const res = await fetch(url, { method: "POST" });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Response data:", data);
  } catch (err: any) {
    console.error("Fetch error:", err.message);
  }
}

main().catch(console.error);
