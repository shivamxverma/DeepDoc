// Faint colour blobs + dot grid behind glass panels so the blur has something to frost.
const Backdrop = () => (
  <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
    <div className="absolute inset-0 bg-dots" />
    <div className="absolute -top-40 left-1/2 h-[28rem] w-[56rem] -translate-x-1/2 rounded-full bg-indigo-300/20 blur-3xl" />
    <div className="absolute top-1/3 -right-40 h-[24rem] w-[32rem] rounded-full bg-sky-300/15 blur-3xl" />
    <div className="absolute -bottom-40 -left-32 h-[22rem] w-[36rem] rounded-full bg-violet-300/10 blur-3xl" />
  </div>
)

export default Backdrop
