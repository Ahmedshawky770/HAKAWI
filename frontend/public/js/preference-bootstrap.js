(function(){try{
var root=document.documentElement;
var theme=null;
try{theme=localStorage.getItem("hakawi.theme");}catch(e){}
if(theme!=="dark"&&theme!=="light"){theme=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}
root.setAttribute("data-theme",theme);
var locale=null;
try{locale=localStorage.getItem("hakawi.locale");}catch(e){}
if(locale!=="ar"&&locale!=="en"){locale="ar";}
root.setAttribute("lang",locale);
root.setAttribute("dir",locale==="ar"?"rtl":"ltr");
}catch(e){}})();
