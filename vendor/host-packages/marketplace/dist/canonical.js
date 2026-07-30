import{createHash as s}from"node:crypto";function u(n){let e=(r)=>{if(r===null||typeof r==="string"||typeof r==="boolean")return r;if(typeof r==="number"){if(!Number.isFinite(r))throw TypeError("canonical JSON rejects non-finite numbers");return Object.is(r,-0)?0:r}if(Array.isArray(r))return r.map(e);if(typeof r==="object"){let o=r;return Object.fromEntries(Object.keys(o).sort().map((t)=>{if(o[t]===void 0)throw TypeError("canonical JSON rejects undefined");return[t,e(o[t])]}))}throw TypeError(`canonical JSON rejects ${typeof r}`)};return JSON.stringify(e(n))}function f(n){return s("sha256").update(n).digest("hex")}export{f as sha256Hex,u as canonicalJson};

//# debugId=D2F975F289D0941764756E2164756E21
//# sourceMappingURL=canonical.js.map
