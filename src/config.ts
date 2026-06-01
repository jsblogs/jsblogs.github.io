export const SITE = {
  website: "https://blogs.jsbisht.com/",
  author: "Jitendra Singh Bisht",
  profile: "https://github.com/jeetmp3",
  desc: "Java, Backend Architecture & AI Engineering",
  seoDesc:
    "JSBisht Labs is a blog by Jitendra Singh Bisht, Principal Developer, sharing practical knowledge on Java, Spring Boot, backend architecture, distributed systems, AI engineering, MCP, RAG, vector databases, Spring AI, and LangChain4j.",
  title: "JSBisht Labs",
  ogImage: "og-image.png",
  lightAndDarkMode: true,
  postPerIndex: 5,
  postPerPage: 5,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  showBackButton: true,
  editPost: {
    enabled: false,
    text: "Edit page",
    url: "https://github.com/jsblogs/jsblogs.github.io/edit/master/",
  },
  dynamicOgImage: true,
  dir: "ltr",
  lang: "en",
  timezone: "America/New_York",
} as const;
