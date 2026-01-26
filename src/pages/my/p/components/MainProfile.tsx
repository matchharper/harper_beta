import React from 'react'
import LinkChips from './LinkChips'
import { locationEnToKo } from '@/utils/language_map'
import { ExperienceCal } from '../CandidateProfile'
import { useMessages } from '@/i18n/useMessage'

const MainProfile = ({ profile_picture, name, headline, location, total_exp_months }: { profile_picture: string, name: string, headline: string, location: string, total_exp_months: number }) => {
    const { m } = useMessages();

    return (
        <div className="flex items-start gap-8 w-[70%]">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-hgray900 border border-hgray1000/5 shrink-0">
                {profile_picture ? (
                    <img
                        src={profile_picture}
                        alt={name ?? "profile"}
                        width={92}
                        height={92}
                        className="w-24 h-24 object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-hgray1000 font-normal">
                        {(name ?? "U").slice(0, 1).toUpperCase()}
                    </div>
                )}
            </div>

            <div className="flex flex-col flex-1 min-w-0 gap-1">
                <div className="text-2xl font-normal text-hgray1000">
                    {name}
                </div>
                <div className="text-base text-hgray900 font-light">
                    {headline}
                </div>

                <div className="flex flex-wrap items-center gap-1 text-sm text-ngray600 font-normal">
                    {location && (
                        <div className="flex flex-row items-center gap-1">
                            <span className="inline-flex items-center gap-1">
                                {locationEnToKo(location)}
                            </span>
                        </div>
                    )}
                </div>
                <div className="flex items-center text-sm text-ngray600 font-normal">
                    {typeof total_exp_months === "number" && (
                        <span className="">
                            {m.data.totalexp}: {ExperienceCal(total_exp_months)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}

export default React.memo(MainProfile)