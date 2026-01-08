async function loadProducts() {
  const main = document.querySelector("main");
  let products = [];

  try {
    const res = await fetch("/api/products");
    products = await res.json();
  } catch(err) {
    main.innerHTML = "<p>載入商品失敗</p>";
    return;
  }

  main.innerHTML = "";

  products.forEach(p => {
    if(p.status === "hidden") return; // 下架商品不顯示

    const item = document.createElement("div");
    item.className = "item";

    const info = document.createElement("div");
    info.className = "info";

    const title = document.createElement("h2");
    title.textContent = p.name;
    if(p.status === "sold") title.classList.add("sold");

    const note = document.createElement("p");
    note.textContent = p.note;
    if(p.status === "sold") note.classList.add("sold");

    const status = document.createElement("div");
    status.className = "status";
    if(p.status === "reserved") status.classList.add("reserved");
    if(p.status === "sold") status.classList.add("sold");

    status.textContent = "狀態：" + (
      p.status === "available" ? "可購買" :
      p.status === "reserved" ? "洽談中" : "已售出"
    );

    info.append(title, note, status);

    const price = document.createElement("div");
    price.className = "price";
    if(p.status === "sold") price.classList.add("sold");
    price.textContent = "NT$ " + p.price;

    item.append(info, price);
    main.append(item);
  });
}

document.addEventListener("DOMContentLoaded", loadProducts);

