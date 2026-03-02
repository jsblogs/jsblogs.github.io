export const SITE = {
  website: "https://blogs.jsbisht.com/",
  author: "Jitendra Singh Bisht",
  profile: "https://github.com/jeetmp3",
  desc: "A blog about Java, Spring, Security, and more by Jitendra Singh Bisht.",
  title: "JSBlogs",
  ogImage: "astropaper-og.jpg",
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
