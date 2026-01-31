
export const scrollToTop = () => {
    const el = document.getElementById("app-scroll");
    if (el) el.scrollTo({ top: 0, left: 0, behavior: "auto" });
    else window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}
