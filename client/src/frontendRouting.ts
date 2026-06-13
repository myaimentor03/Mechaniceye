export type FrontendLocation = {
  pathname: string;
  search: string;
};

function normalizePathname(pathname: string) {
  return pathname.replace(/\/$/, "") || "/";
}

export function getFrontendLocation(): FrontendLocation {
  const route = new URLSearchParams(window.location.search).get("route");

  if (route?.startsWith("/")) {
    const routeUrl = new URL(route, window.location.origin);
    return {
      pathname: normalizePathname(routeUrl.pathname),
      search: routeUrl.search,
    };
  }

  return {
    pathname: normalizePathname(window.location.pathname),
    search: window.location.search,
  };
}

export function getFrontendRoutePath() {
  return getFrontendLocation().pathname;
}

export function getFrontendSearchParams() {
  return new URLSearchParams(getFrontendLocation().search);
}

export function toFrontendHref(destination: string) {
  const target = new URL(destination, window.location.origin);

  if (target.origin !== window.location.origin) {
    return target.href;
  }

  const route = `${target.pathname}${target.search}${target.hash}`;
  return route === "/" ? "/" : `/?route=${encodeURIComponent(route)}`;
}

export function navigateFrontend(destination: string) {
  window.location.assign(toFrontendHref(destination));
}
