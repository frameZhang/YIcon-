import isomFetch from 'isom-fetch';
import {
  FETCH_ICON_DETAIL,
  EDIT_ICON,
  EDIT_ICON_STYLE,
  DOWNLOAD_ICONS,
  RESET_TAGS,
} from '../constants/actionTypes';

const fetch = isomFetch.create({ baseURL: '/api' });

export function getIconDetail(iconId) {
  return {
    type: FETCH_ICON_DETAIL,
    payload: fetch.get(`/icons/${iconId}`),
  };
}

export function editIcon(iconId, param) {
  return {
    type: EDIT_ICON,
    payload: fetch.patch(`/user/icons/${iconId}`, param),
  };
}

export function editIconStyle(style) {
  return {
    type: EDIT_ICON_STYLE,
    payload: style,
  };
}

export function resetTags(fn) {
  return {
    type: RESET_TAGS,
    payload: fn,
  };
}

export function downloadIcon(obj) {
  return (dispatch) => {
    dispatch({
      type: DOWNLOAD_ICONS,
      payload: fetch.post('/download/font', obj).then((response) => {
        if (response.res) {
          const { foldName } = response.data;
          window.location.pathname = `/download/${foldName}`;
        }
      }),
    });
  };
}
