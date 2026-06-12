import { Html, Head, Main, NextScript } from "next/document";

const DOM_MUTATION_GUARD_SCRIPT = `
(function () {
  if (typeof window === "undefined" || typeof Node === "undefined") return;
  if (window.__harperDomMutationGuardInstalled) return;
  window.__harperDomMutationGuardInstalled = true;

  var originalRemoveChild = Node.prototype.removeChild;
  var originalInsertBefore = Node.prototype.insertBefore;

  function isNotFoundError(error) {
    return error && (error.name === "NotFoundError" || String(error.message || "").indexOf("not a child of this node") !== -1);
  }

  Node.prototype.removeChild = function (child) {
    try {
      return originalRemoveChild.call(this, child);
    } catch (error) {
      if (isNotFoundError(error) && child && child.parentNode !== this) {
        return child;
      }
      throw error;
    }
  };

  Node.prototype.insertBefore = function (newNode, referenceNode) {
    try {
      return originalInsertBefore.call(this, newNode, referenceNode);
    } catch (error) {
      if (isNotFoundError(error) && referenceNode && referenceNode.parentNode !== this) {
        return this.appendChild(newNode);
      }
      throw error;
    }
  };
})();
`;

export default function Document() {
  return (
    <Html lang="ko" className="notranslate" translate="no">
      <Head>
        <meta name="google" content="notranslate" />
        <script
          dangerouslySetInnerHTML={{ __html: DOM_MUTATION_GUARD_SCRIPT }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Averia+Serif+Libre:wght@300;400;700&family=Cormorant+Garamond:ital,wght@0,300..700;1,300..700&family=DM+Mono:wght@300;400;500&family=Geist:wght@400;500;700;900&family=Halant:wght@300;400;500;600;700&family=Hedvig+Letters+Serif:opsz@12..24&family=Instrument+Serif:ital@0;1&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Montserrat:wght@400;700&family=Noto+Serif+KR:wght@400;500&family=Roboto:wght@300;400;500;700&display=swap"
        />
      </Head>
      <body className="notranslate" translate="no">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
