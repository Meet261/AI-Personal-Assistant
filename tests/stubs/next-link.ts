import React from 'react'

export default function Link(props: any) {
  const { href, children, ...rest } = props ?? {}
  const safeHref = typeof href === 'string' ? href : (href?.pathname ?? '#')
  return React.createElement('a', { href: safeHref, ...rest }, children)
}

