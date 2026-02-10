import React from 'react'
import LinkChips from './LinkChips'
import { locationEnToKo } from '@/utils/language_map'
import { MapPin } from 'lucide-react'
import { initials } from '@/components/NameProfile'

const MainProfile = ({ profile_picture, name, headline, location, links }: { profile_picture: string, name: string, headline: string, location: string, links: string[] }) => {
    const hasLinks = (links?.length ?? 0) > 0;

    return (
        <div className="items-start w-[100%] grid grid-cols-7">
            <div className="col-span-1">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-hgray900 border border-hgray1000/5 shrink-0">
                    {profile_picture && !profile_picture.includes("media.licdn.com") ? (
                        <img
                            src={profile_picture}
                            alt={name ?? "profile"}
                            width={92}
                            height={92}
                            className="w-24 h-24 object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-hgray1000 bg-gradblack font-normal text-2xl">
                            {initials(name)}
                        </div>
                    )}
                </div>
            </div>

            <div className="col-span-6 flex flex-col flex-1 min-w-0 gap-1">
                <div className="text-2xl font-normal text-hgray1000">
                    {name}
                </div>
                <div className="text-base text-hgray900 font-light">
                    {headline}
                </div>

                <div className="flex flex-wrap items-center gap-1 text-sm text-ngray600 font-normal">
                    {location && (
                        <div className="flex flex-row items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            <span className="inline-flex items-center gap-1">
                                {locationEnToKo(location)}
                            </span>
                        </div>
                    )}
                </div>

                {/* Links */}
                <div className="mt-2">
                    {!hasLinks ? (
                        <div className="text-sm text-xgray600">No links</div>
                    ) : (
                        <LinkChips links={links} />
                    )}
                </div>
            </div>
        </div>
    )
}

export default React.memo(MainProfile)