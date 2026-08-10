import Image from 'next/image';

export default function LogoBar() {
  return (
    <Image
      src="/images/logo.svg"
      alt="Wren AI"
      width={125}
      height={30}
      priority
    />
  );
}
