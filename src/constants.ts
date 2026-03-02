import type { Props } from "astro";
import IconMail from "@/assets/icons/IconMail.svg";
import IconGitHub from "@/assets/icons/IconGitHub.svg";
import IconBrandX from "@/assets/icons/IconBrandX.svg";
import IconLinkedin from "@/assets/icons/IconLinkedin.svg";
import IconWhatsapp from "@/assets/icons/IconWhatsapp.svg";
import IconFacebook from "@/assets/icons/IconFacebook.svg";
import IconTelegram from "@/assets/icons/IconTelegram.svg";
import IconPinterest from "@/assets/icons/IconPinterest.svg";
import IconStackOverflow from "@/assets/icons/IconStackOverflow.svg";
import { SITE } from "@/config";

interface Social {
  name: string;
  href: string;
  linkTitle: string;
  icon: (_props: Props) => Element;
}

export const SOCIALS: Social[] = [
  {
    name: "GitHub",
    href: "https://github.com/jeetmp3",
    linkTitle: `${SITE.author} on GitHub`,
    icon: IconGitHub,
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/jitendra-bisht-a7a25845/",
    linkTitle: `${SITE.author} on LinkedIn`,
    icon: IconLinkedin,
  },
  {
    name: "X",
    href: "https://x.com/JitendraBisht3",
    linkTitle: `${SITE.author} on X`,
    icon: IconBrandX,
  },
  {
    name: "StackOverflow",
    href: "https://stackoverflow.com/users/2800782/jitendra-singh",
    linkTitle: `${SITE.author} on Stack Overflow`,
    icon: IconStackOverflow,
  },
  {
    name: "Mail",
    href: "mailto:jeet.mp3@gmail.com",
    linkTitle: `Send an email to ${SITE.author}`,
    icon: IconMail,
  },
] as const;

export const SHARE_LINKS: Social[] = [
  {
    name: "WhatsApp",
    href: "https://wa.me/?text=",
    linkTitle: `Share this post via WhatsApp`,
    icon: IconWhatsapp,
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/sharer.php?u=",
    linkTitle: `Share this post on Facebook`,
    icon: IconFacebook,
  },
  {
    name: "X",
    href: "https://x.com/intent/post?url=",
    linkTitle: `Share this post on X`,
    icon: IconBrandX,
  },
  {
    name: "Telegram",
    href: "https://t.me/share/url?url=",
    linkTitle: `Share this post via Telegram`,
    icon: IconTelegram,
  },
  {
    name: "Pinterest",
    href: "https://pinterest.com/pin/create/button/?url=",
    linkTitle: `Share this post on Pinterest`,
    icon: IconPinterest,
  },
  {
    name: "Mail",
    href: "mailto:?subject=See%20this%20post&body=",
    linkTitle: `Share this post via email`,
    icon: IconMail,
  },
] as const;

// Giscus config — fill in repoId and categoryId after enabling Discussions
// on jsblogs/jsblogs.github.io and running https://giscus.app
export const GISCUS = {
  repo: "jsblogs/jsblogs.github.io" as `${string}/${string}`,
  repoId: "MDEwOlJlcG9zaXRvcnkyNDE2MzQyODA=",
  category: "Announcements",
  categoryId: "DIC_kwDODmcL6M4C3g-P",
  mapping: "pathname" as const,
  reactionsEnabled: "1" as const,
  lang: "en",
  loading: "lazy" as const,
};
