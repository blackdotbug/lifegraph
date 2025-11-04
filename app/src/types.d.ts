// Helpful loose module declarations to keep svelte-check happy for this project
declare module '*.json' {
  const value: any;
  export default value;
}

declare module 'luxon' {
  export const DateTime: any;
  export default { DateTime };
}

// allow importing package without types used only in Svelte markup
declare module 'svelte-vertical-timeline' {
  export const Timeline: any;
  export const TimelineItem: any;
  export const TimelineSeparator: any;
  export const TimelineDot: any;
  export const TimelineConnector: any;
  export const TimelineContent: any;
  export const TimelineOppositeContent: any;
}
