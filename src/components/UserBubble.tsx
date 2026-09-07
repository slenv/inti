export default function UserBubble({
  user,
  size = 16,
}: {
  user: { name: string; color: string; avatar_url: string | null }
  size?: number
}) {
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: user.color,
        fontSize: Math.round(size * 0.5),
      }}
    >
      {user.name.charAt(0).toUpperCase()}
    </span>
  )
}