import { useGarageIdentity } from '../context/GarageIdentityContext'

export default function Footer() {
  const { garageName, displayLogo } = useGarageIdentity()
  const year = new Date().getFullYear()

  return (
    <footer className="app-footer">
      <img src={displayLogo} alt={garageName} className="app-footer-logo" />
      <span className="app-footer-team">{garageName}</span>
      <span className="app-footer-copy">© {year}</span>
    </footer>
  )
}
