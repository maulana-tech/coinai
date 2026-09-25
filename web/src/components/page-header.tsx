type PageHeaderProps = {
  title: string
  caption: string
}

export function PageHeader({ title, caption }: PageHeaderProps) {
  return (
    <header>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{caption}</p>
    </header>
  )
}
