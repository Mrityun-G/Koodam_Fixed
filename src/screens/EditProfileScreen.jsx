import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { SubHeader } from '../components/SubHeader';
import { supabase } from '../lib/supabase';

export const EditProfileScreen = () => {
  const {
  userProfile,
  updateUserProfile,
  partnerProfile,
  updatePartnerProfile,
  role,
  authUser,
  navigateTo,
  showToast
} = useApp();

  const profile =
    role === 'partner'
      ? partnerProfile
      : userProfile;

  const updateProfile =
    role === 'partner'
      ? updatePartnerProfile
      : updateUserProfile;

  const [name, setName] = useState(profile.name || '');
  const [email, setEmail] = useState(profile.email || '');
  const [phone, setPhone] = useState(profile.phone || '');

  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(
    profile.avatar || ''
  );

  const fileInputRef = useRef(null);

  // -------------------------------------------------------
  // PHOTO SELECT
  // -------------------------------------------------------

  const handlePhotoSelect = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file');
      return;
    }

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      showToast('Photo must be less than 5 MB');
      return;
    }

    setSelectedPhoto(file);

    const previewUrl = URL.createObjectURL(file);

    setPhotoPreview(previewUrl);
  };

  // -------------------------------------------------------
  // GET BACKEND PROFILE ID WHEN IT IS MISSING
  // -------------------------------------------------------

  const getProfileId = async () => {
    // Existing working profile ID
    if (profile?.id) {
      return profile.id;
    }

    // Firebase user is required
    if (!authUser?.uid) {
      throw new Error(
        'You are not logged in. Please login again.'
      );
    }

    const BACKEND_URL =
      import.meta.env.VITE_BACKEND_URL ||
      'http://127.0.0.1:8000';

    const response = await fetch(
      `${BACKEND_URL}/users/firebase/${authUser.uid}`
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        'Could not load backend profile:',
        response.status,
        errorText
      );

      throw new Error(
        'User profile could not be loaded from the server.'
      );
    }

    const backendUser = await response.json();

    if (!backendUser?.id) {
      throw new Error(
        'Backend profile does not contain a user ID.'
      );
    }

    console.log(
      'Recovered backend profile ID:',
      backendUser.id
    );

    return backendUser.id;
  };

  // -------------------------------------------------------
  // UPLOAD PHOTO
  // -------------------------------------------------------

  const uploadPhoto = async (file) => {
    if (!file) {
      return profile.avatar || null;
    }

    // Get existing ID or recover it from backend
    const profileId = await getProfileId();

    const fileExtension =
      file.name.split('.').pop() || 'jpg';

    const fileName =
      `${profileId}-${Date.now()}.${fileExtension}`;

    const filePath =
      `profiles/${profileId}/${fileName}`;

    const { error: uploadError } =
      await supabase.storage
        .from('profile-photos')
        .upload(
          filePath,
          file,
          {
            cacheControl: '3600',
            upsert: false
          }
        );

    if (uploadError) {
      throw uploadError;
    }

    const { data } =
      supabase.storage
        .from('profile-photos')
        .getPublicUrl(filePath);

    return data.publicUrl;
  };

  // -------------------------------------------------------
  // SAVE PROFILE
  // -------------------------------------------------------

  const handleSave = async () => {
    if (
      !name.trim() ||
      !email.trim() ||
      !phone.trim()
    ) {
      showToast('Please fill all fields');
      return;
    }

    try {
      console.log(
        'Saving profile:',
        {
          role,
          profileId: profile?.id,
          firebaseUid: authUser?.uid
        }
      );

      let avatar = profile.avatar || null;

      // Upload photo only if a new photo was selected
      if (selectedPhoto) {
        avatar = await uploadPhoto(
          selectedPhoto
        );
      }

      const result = await updateProfile({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        avatar
      });

      // Do not navigate if backend update failed
      if (result === false) {
        return;
      }

      navigateTo(
        'profile',
        'profile'
      );

    } catch (error) {
      console.error(
        'Profile update error:',
        error
      );

      showToast(
        error?.message ||
        'Failed to update profile'
      );
    }
  };

  return (
    <div className="flex-1 flex flex-col relative w-full bg-[#f8f9ff] min-h-screen">

      <SubHeader title="Edit Profile" />

      <main className="flex-1 flex flex-col relative w-full pb-10 px-4 space-y-4 pt-4">

        {/* PROFILE PHOTO */}
        <div className="flex flex-col items-center gap-2">

          <img
            className="w-20 h-20 rounded-2xl object-cover shadow-xs"
            alt={profile.name || 'Profile'}
            src={
              photoPreview ||
              '/logo.svg'
            }
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoSelect}
            className="hidden"
          />

          <button
            type="button"
            onClick={() =>
              fileInputRef.current?.click()
            }
            className="text-xs font-bold text-[#a14000] hover:underline"
          >
            Change Photo
          </button>

        </div>

        {/* PROFILE DETAILS */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 space-y-3.5">

          <label className="block">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Full Name
            </span>

            <input
              type="text"
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8f9ff] p-2.5 text-sm text-[#0b1c30] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Email
            </span>

            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8f9ff] p-2.5 text-sm text-[#0b1c30] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Phone
            </span>

            <input
              type="tel"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value)
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8f9ff] p-2.5 text-sm text-[#0b1c30] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
            />
          </label>

        </div>

        {/* SAVE */}
        <button
          onClick={handleSave}
          className="w-full py-3 rounded-full bg-[#ff6a00] hover:bg-[#a14000] text-white font-bold text-sm shadow-md active:scale-95 transition-all"
        >
          Save Changes
        </button>

      </main>
    </div>
  );
};